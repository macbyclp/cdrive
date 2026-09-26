import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({ deleteMany: vi.fn(), findUnique: vi.fn(), requireUser: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: { tag: { deleteMany: m.deleteMany, findUnique: m.findUnique } } }));
vi.mock("@/lib/auth", () => ({ requireUser: m.requireUser, AuthError: class extends Error {} }));

const ctx = { params: Promise.resolve({ id: "t1" }) };
const del = () => new Request("http://x/api/tags/t1", { method: "DELETE" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DELETE /api/tags/[id]", () => {
  it("ADMIN kullanımdaki etiketi de siler", async () => {
    const { DELETE } = await import("@/app/api/tags/[id]/route");
    m.requireUser.mockResolvedValue({ id: "a", role: "ADMIN" });
    m.deleteMany.mockResolvedValue({ count: 1 });
    expect((await DELETE(del(), ctx)).status).toBe(200);
    expect(m.deleteMany).toHaveBeenCalledWith({ where: { id: "t1" } });
  });

  it("MEMBER yalnız kullanılmayan etiketi silebilir (koşul sorgunun içinde)", async () => {
    const { DELETE } = await import("@/app/api/tags/[id]/route");
    m.requireUser.mockResolvedValue({ id: "u", role: "MEMBER" });
    m.deleteMany.mockResolvedValue({ count: 1 });
    expect((await DELETE(del(), ctx)).status).toBe(200);
    expect(m.deleteMany).toHaveBeenCalledWith({ where: { id: "t1", fileTags: { none: {} }, folderTags: { none: {} } } });
  });

  it("MEMBER kullanımdaki etiketi silemez: 403", async () => {
    const { DELETE } = await import("@/app/api/tags/[id]/route");
    m.requireUser.mockResolvedValue({ id: "u", role: "MEMBER" });
    m.deleteMany.mockResolvedValue({ count: 0 });
    m.findUnique.mockResolvedValue({ id: "t1" });
    expect((await DELETE(del(), ctx)).status).toBe(403);
  });

  it("zaten silinmiş etiket için ok döner", async () => {
    const { DELETE } = await import("@/app/api/tags/[id]/route");
    m.requireUser.mockResolvedValue({ id: "u", role: "MANAGER" });
    m.deleteMany.mockResolvedValue({ count: 0 });
    m.findUnique.mockResolvedValue(null);
    expect((await DELETE(del(), ctx)).status).toBe(200);
  });
});
