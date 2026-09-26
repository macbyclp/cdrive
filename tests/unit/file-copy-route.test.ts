import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  requireUser: vi.fn(),
  canAccessFile: vi.fn(),
  canAccessFolder: vi.fn(),
  create: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: { file: { findUnique: m.findUnique, findFirst: m.findFirst } } }));
vi.mock("@/lib/auth", () => ({ requireUser: m.requireUser, AuthError: class extends Error {} }));
vi.mock("@/lib/access", () => ({ canAccessFile: m.canAccessFile, canAccessFolder: m.canAccessFolder }));
vi.mock("@/lib/policy", () => ({ assertFilePolicy: vi.fn() }));
vi.mock("@/lib/file-versions", () => ({ createFileFromBuffer: m.create }));
vi.mock("@/lib/storage", () => ({ readFile: m.readFile }));
vi.mock("@/lib/quota-notify", () => ({ notifyIfQuotaWarning: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

const ctx = { params: Promise.resolve({ id: "f1" }) };
const post = (body: unknown = {}) =>
  new Request("http://x/api/files/f1/copy", { method: "POST", body: JSON.stringify(body) });
const source = {
  id: "f1", name: "rapor.pdf", mimeType: "application/pdf", folderId: "klasor", deletedAt: null,
  searchText: "metin", currentVersion: { storageKey: "k1", size: 3n },
};

beforeEach(() => {
  vi.clearAllMocks();
  m.requireUser.mockResolvedValue({ id: `u-${Math.random()}` });
  m.canAccessFile.mockResolvedValue(true);
  m.canAccessFolder.mockResolvedValue(true);
  m.findUnique.mockResolvedValue(source);
  m.findFirst.mockResolvedValue(null);
  m.readFile.mockResolvedValue(Buffer.from("abc"));
  m.create.mockImplementation(async (i: { name: string }) => ({ id: "yeni", name: i.name, size: 3n }));
});

describe("POST /api/files/[id]/copy", () => {
  it("erişimi olmayan 403 alır ve dosya okunmaz", async () => {
    const { POST } = await import("@/app/api/files/[id]/copy/route");
    m.canAccessFile.mockResolvedValue(false);
    expect((await POST(post(), ctx)).status).toBe(403);
    expect(m.readFile).not.toHaveBeenCalled();
  });

  it("çöpteki dosya 404", async () => {
    const { POST } = await import("@/app/api/files/[id]/copy/route");
    m.findUnique.mockResolvedValue({ ...source, deletedAt: new Date() });
    expect((await POST(post(), ctx)).status).toBe(404);
  });

  it("aynı klasöre, kullanıcının sahipliğinde '(kopya)' adıyla oluşturur", async () => {
    const { POST } = await import("@/app/api/files/[id]/copy/route");
    const res = await POST(post(), ctx);
    expect(res.status).toBe(200);
    const input = m.create.mock.calls[0][0];
    expect(input).toMatchObject({ name: "rapor (kopya).pdf", folderId: "klasor", mimeType: "application/pdf", searchText: "metin" });
    expect(input.ownerId).toBe((await m.requireUser.mock.results[0].value).id);
    expect((await res.json()).size).toBe("3");
  });

  it("kaynak klasörde yazma izni yoksa köke kopyalar", async () => {
    const { POST } = await import("@/app/api/files/[id]/copy/route");
    m.canAccessFolder.mockResolvedValue(false);
    await POST(post(), ctx);
    expect(m.create.mock.calls[0][0].folderId).toBeNull();
  });

  it("açıkça verilen klasörde yazma izni yoksa 403", async () => {
    const { POST } = await import("@/app/api/files/[id]/copy/route");
    m.canAccessFolder.mockResolvedValue(false);
    expect((await POST(post({ folderId: "baska" }), ctx)).status).toBe(403);
    expect(m.create).not.toHaveBeenCalled();
  });
});
