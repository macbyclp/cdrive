import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  verifyPassword: vi.fn(),
  serve: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: { shareLink: { findUnique: m.findUnique, update: m.update } } }));
vi.mock("@/lib/auth", () => ({ verifyPassword: m.verifyPassword, AuthError: class extends Error {} }));
vi.mock("@/lib/audit", () => ({ logAudit: m.logAudit }));
vi.mock("@/lib/http-range", () => ({ serveStoredFile: m.serve }));

const link = (over: Record<string, unknown> = {}) => ({
  id: "l1",
  revoked: false,
  expiresAt: null,
  maxDownloads: null,
  downloadCount: 0,
  passwordHash: "hash",
  file: { id: "f1", name: "a.txt", mimeType: "text/plain", deletedAt: null, currentVersion: { storageKey: "k" } },
  ...over,
});
const ctx = { params: Promise.resolve({ token: "tok" }) };
let ipCounter = 0;
const mk = (method: string, init: { headers?: Record<string, string>; body?: unknown; url?: string } = {}) =>
  new Request(init.url ?? "http://x/api/share/tok", {
    method,
    headers: { "x-forwarded-for": `10.0.0.${++ipCounter}`, ...(init.headers ?? {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.SHARE_ALLOW_QUERY_PASSWORD;
  m.verifyPassword.mockImplementation(async (p: string) => p === "dogru");
  m.serve.mockResolvedValue(new Response("icerik", { status: 200 }));
});

describe("paylaşım indirme uç noktası", () => {
  it("bilinmeyen token 404", async () => {
    const { GET } = await import("@/app/api/share/[token]/route");
    m.findUnique.mockResolvedValue(null);
    expect((await GET(mk("GET"), ctx)).status).toBe(404);
  });
  it("şifresiz bağlantı indirilir ve sayaç artar", async () => {
    const { GET } = await import("@/app/api/share/[token]/route");
    m.findUnique.mockResolvedValue(link({ passwordHash: null }));
    expect((await GET(mk("GET"), ctx)).status).toBe(200);
    expect(m.update).toHaveBeenCalledTimes(1);
    expect(m.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "DOWNLOAD", ip: expect.any(String) }));
  });
  it("şifreli bağlantı: şifresiz 401, yanlış şifre 401", async () => {
    const { GET, POST } = await import("@/app/api/share/[token]/route");
    m.findUnique.mockResolvedValue(link());
    expect((await GET(mk("GET"), ctx)).status).toBe(401);
    expect((await POST(mk("POST", { body: { password: "yanlis" } }), ctx)).status).toBe(401);
  });
  it("POST gövdesindeki doğru şifre kabul edilir; x-share-password başlığı da", async () => {
    const { GET, POST } = await import("@/app/api/share/[token]/route");
    m.findUnique.mockResolvedValue(link());
    expect((await POST(mk("POST", { body: { password: "dogru" } }), ctx)).status).toBe(200);
    expect((await GET(mk("GET", { headers: { "x-share-password": "dogru" } }), ctx)).status).toBe(200);
  });
  it("?password= sorgu parametresi varsayılan olarak REDDEDİLİR, bayrakla kabul edilir", async () => {
    const { GET } = await import("@/app/api/share/[token]/route");
    m.findUnique.mockResolvedValue(link());
    expect((await GET(mk("GET", { url: "http://x/api/share/tok?password=dogru" }), ctx)).status).toBe(401);
    process.env.SHARE_ALLOW_QUERY_PASSWORD = "1";
    expect((await GET(mk("GET", { url: "http://x/api/share/tok?password=dogru" }), ctx)).status).toBe(200);
  });
  it("Range devam isteği sayacı ve denetim kaydını tekrar artırmaz; limit dolsa bile reddedilmez", async () => {
    const { GET } = await import("@/app/api/share/[token]/route");
    m.findUnique.mockResolvedValue(link({ passwordHash: null, maxDownloads: 1, downloadCount: 1 }));
    // ilk (Range'siz) istek limit dolduğu için 410
    expect((await GET(mk("GET"), ctx)).status).toBe(410);
    const res = await GET(mk("GET", { headers: { range: "bytes=100-" } }), ctx);
    expect(res.status).toBe(200);
    expect(m.update).not.toHaveBeenCalled();
    expect(m.logAudit).not.toHaveBeenCalled();
  });
  it("IP başına hız sınırı 429 döner", async () => {
    const { GET } = await import("@/app/api/share/[token]/route");
    m.findUnique.mockResolvedValue(null);
    const headers = { "x-forwarded-for": "203.0.113.9" };
    let last = 0;
    for (let i = 0; i < 61; i++) last = (await GET(new Request("http://x/api/share/tok", { headers }), ctx)).status;
    expect(last).toBe(429);
  });
});
