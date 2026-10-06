import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  findRequest: vi.fn(),
  findUser: vi.fn(),
  findFolder: vi.fn(),
  findFiles: vi.fn(),
  exec: vi.fn(),
  parse: vi.fn(),
  createFile: vi.fn(),
  deleteFile: vi.fn(),
  policy: vi.fn(),
  notify: vi.fn(),
  audit: vi.fn(),
  verify: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    uploadRequest: { findUnique: m.findRequest },
    user: { findUnique: m.findUser },
    folder: { findUnique: m.findFolder },
    file: { findMany: m.findFiles },
    $executeRaw: m.exec,
  },
}));
vi.mock("@/lib/auth", () => ({ verifyPassword: m.verify, AuthError: class extends Error {} }));
vi.mock("@/lib/audit", () => ({ logAudit: m.audit }));
vi.mock("@/lib/notify", () => ({ notifyUser: m.notify }));
vi.mock("@/lib/policy", () => ({ assertFilePolicy: m.policy, maxUploadBytes: async () => 1_000_000_000 }));
vi.mock("@/lib/file-versions", () => ({ createFileFromStored: m.createFile }));
vi.mock("@/lib/storage", () => ({ deleteFile: m.deleteFile }));
vi.mock("@/lib/upload-stream", async () => {
  class UploadTooLargeError extends Error {
    status = 413;
  }
  return { parseSingleFileUpload: m.parse, UploadTooLargeError };
});

const future = new Date(Date.now() + 86_400_000);
const goodRequest = {
  id: "r1", token: "tok", folderId: "f1", createdById: "owner", title: "Belgeler", passwordHash: null,
  expiresAt: future, maxFiles: 5, maxFileBytes: 10n * 1024n * 1024n, uploadCount: 0, revoked: false,
};
const post = (headers: Record<string, string> = {}) =>
  new Request("http://x/api/upload-request/tok", { method: "POST", headers: { "x-forwarded-for": `9.9.9.${Math.floor(Math.random() * 250)}`, ...headers }, body: "x" });
const ctx = { params: Promise.resolve({ token: "tok" }) };
let POST: typeof import("@/app/api/upload-request/[token]/route").POST;

beforeEach(async () => {
  vi.clearAllMocks();
  ({ POST } = await import("@/app/api/upload-request/[token]/route"));
  m.findRequest.mockResolvedValue(goodRequest);
  m.exec.mockResolvedValue(1);
  m.findUser.mockResolvedValue({ id: "owner", active: true });
  m.findFolder.mockResolvedValue({ id: "f1", deletedAt: null });
  m.findFiles.mockResolvedValue([]);
  m.parse.mockResolvedValue({ fields: {}, file: { name: "rapor.pdf", mimeType: "application/pdf", storageKey: "key1", size: 1234 } });
  m.createFile.mockResolvedValue({ id: "file1" });
  m.notify.mockResolvedValue({});
  m.deleteFile.mockResolvedValue(undefined);
  m.policy.mockResolvedValue(undefined);
  m.verify.mockResolvedValue(true);
});

const released = () => m.exec.mock.calls.length > 1; // 1. çağrı kontenjan alma, 2. çağrı geri verme

describe("POST /api/upload-request/[token]", () => {
  it("başarılı yükleme: dosya isteği oluşturanın adına, istenen klasöre yazılır; kontenjan geri verilmez", async () => {
    const res = await POST(post(), ctx);
    expect(res.status).toBe(200);
    expect(m.createFile).toHaveBeenCalledWith(expect.objectContaining({ folderId: "f1", ownerId: "owner", storageKey: "key1", name: "rapor.pdf", searchText: null }));
    expect(released()).toBe(false);
    expect(m.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: "owner", type: "UPLOAD_RECEIVED", targetType: "folder", targetId: "f1" }));
    expect(m.deleteFile).not.toHaveBeenCalled();
  });

  it("aynı adlı dosya varsa üzerine yazmaz, '(2)' ekler", async () => {
    m.findFiles.mockResolvedValue([{ name: "rapor.pdf" }]);
    await POST(post(), ctx);
    expect(m.createFile).toHaveBeenCalledWith(expect.objectContaining({ name: "rapor (2).pdf" }));
  });

  it("bilinmeyen / iptal / dolmuş / süresi geçmiş istek dosya kabul etmez", async () => {
    m.findRequest.mockResolvedValue(null);
    expect((await POST(post(), ctx)).status).toBe(404);
    m.findRequest.mockResolvedValue({ ...goodRequest, revoked: true });
    expect((await POST(post(), ctx)).status).toBe(404);
    m.findRequest.mockResolvedValue({ ...goodRequest, uploadCount: 5 });
    expect((await POST(post(), ctx)).status).toBe(410);
    m.findRequest.mockResolvedValue({ ...goodRequest, expiresAt: new Date(Date.now() - 1000) });
    expect((await POST(post(), ctx)).status).toBe(410);
    expect(m.parse).not.toHaveBeenCalled();
  });

  it("şifreli istekte şifre olmadan/yanlışsa gövde OKUNMADAN 401", async () => {
    m.findRequest.mockResolvedValue({ ...goodRequest, passwordHash: "hash" });
    expect((await POST(post(), ctx)).status).toBe(401);
    m.verify.mockResolvedValue(false);
    expect((await POST(post({ "x-upload-password": "yanlis" }), ctx)).status).toBe(401);
    expect(m.parse).not.toHaveBeenCalled();
    expect(m.exec).not.toHaveBeenCalled();
  });

  it("doğru şifreyle yükleme kabul edilir", async () => {
    m.findRequest.mockResolvedValue({ ...goodRequest, passwordHash: "hash" });
    expect((await POST(post({ "x-upload-password": "dogru" }), ctx)).status).toBe(200);
  });

  it("kontenjan alınamazsa (yarış/limit) 410, gövde okunmaz", async () => {
    m.exec.mockResolvedValue(0);
    expect((await POST(post(), ctx)).status).toBe(410);
    expect(m.parse).not.toHaveBeenCalled();
  });

  it("Content-Length sınırı çok aşıyorsa gövde okunmadan 413", async () => {
    const res = await POST(post({ "content-length": String(500 * 1024 * 1024) }), ctx);
    expect(res.status).toBe(413);
    expect(m.parse).not.toHaveBeenCalled();
    expect(m.exec).not.toHaveBeenCalled();
  });

  it("akış sırasında boyut aşılırsa 413 ve kontenjan geri verilir", async () => {
    const { UploadTooLargeError } = await import("@/lib/upload-stream");
    m.parse.mockRejectedValue(new (UploadTooLargeError as unknown as new () => Error)());
    expect((await POST(post(), ctx)).status).toBe(413);
    expect(released()).toBe(true);
  });

  it("politika reddi: kontenjan geri verilir ve diske yazılan dosya silinir", async () => {
    m.policy.mockRejectedValue(Object.assign(new Error(".exe engellendi"), { status: 400 }));
    const res = await POST(post(), ctx);
    expect(res.status).toBe(400);
    expect(released()).toBe(true);
    expect(m.deleteFile).toHaveBeenCalledWith("key1");
    expect(m.createFile).not.toHaveBeenCalled();
  });

  it("klasör silinmişse / sahip pasifse 410 ve temizlik yapılır", async () => {
    m.findFolder.mockResolvedValue({ id: "f1", deletedAt: new Date() });
    expect((await POST(post(), ctx)).status).toBe(410);
    expect(m.deleteFile).toHaveBeenCalledWith("key1");
    expect(released()).toBe(true);
  });

  it("boş dosya reddedilir", async () => {
    m.parse.mockResolvedValue({ fields: {}, file: { name: "bos.txt", mimeType: "text/plain", storageKey: "key2", size: 0 } });
    expect((await POST(post(), ctx)).status).toBe(400);
    expect(m.deleteFile).toHaveBeenCalledWith("key2");
  });

  it("yazma başarısız olursa (createFile hatası) kontenjan geri verilir; dosyayı createFile siler (çift silme yok)", async () => {
    m.createFile.mockRejectedValue(new Error("db"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await POST(post(), ctx)).status).toBe(500);
    spy.mockRestore();
    expect(released()).toBe(true);
    expect(m.deleteFile).not.toHaveBeenCalled();
  });

  it("yükleme adı yol parçalarından arındırılır", async () => {
    m.parse.mockResolvedValue({ fields: {}, file: { name: "../../x/evil.txt", mimeType: "text/plain", storageKey: "k", size: 5 } });
    await POST(post(), ctx);
    expect(m.createFile).toHaveBeenCalledWith(expect.objectContaining({ name: ".._.._x_evil.txt" }));
  });
});
