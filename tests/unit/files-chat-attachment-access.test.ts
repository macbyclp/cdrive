import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  findMany: vi.fn(),
  fileFindUnique: vi.fn(),
  canAccessFile: vi.fn(),
  canAccessChatChannel: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { chatMessage: { findMany: m.findMany }, file: { findUnique: m.fileFindUnique } },
}));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ id: "u1", role: "MEMBER" }) }));
vi.mock("@/lib/access", () => ({
  canAccessFile: m.canAccessFile,
  canAccessFolder: vi.fn(),
  canAccessChatChannel: m.canAccessChatChannel,
}));
vi.mock("@/lib/http-range", () => ({ serveStoredFile: async () => new Response("x") }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

const call = async () => {
  const { GET } = await import("@/app/api/files/[id]/route");
  return GET(new Request("http://x/api/files/f1"), { params: Promise.resolve({ id: "f1" }) });
};

beforeEach(() => {
  vi.clearAllMocks();
  m.canAccessFile.mockResolvedValue(false);
  m.fileFindUnique.mockResolvedValue({
    id: "f1", name: "a.txt", mimeType: "text/plain", deletedAt: null,
    currentVersion: { storageKey: "k" },
  });
});

describe("GET /api/files/[id] sohbet eki istisnası", () => {
  it("gizli kanal eki, üye olmayana 403 döner", async () => {
    m.findMany.mockResolvedValue([{ channelId: "c1", senderId: "other", recipientId: null }]);
    m.canAccessChatChannel.mockResolvedValue(false);
    expect((await call()).status).toBe(403);
    expect(m.canAccessChatChannel).toHaveBeenCalledWith(expect.objectContaining({ id: "u1" }), "c1");
  });

  it("kanal erişimi olan kullanıcı eki indirebilir", async () => {
    m.findMany.mockResolvedValue([{ channelId: "c1", senderId: "other", recipientId: null }]);
    m.canAccessChatChannel.mockResolvedValue(true);
    expect((await call()).status).toBe(200);
  });

  it("DM alıcısı eki indirebilir", async () => {
    m.findMany.mockResolvedValue([{ channelId: null, senderId: "other", recipientId: "u1" }]);
    expect((await call()).status).toBe(200);
  });

  it("hiç mesaj yoksa 403", async () => {
    m.findMany.mockResolvedValue([]);
    expect((await call()).status).toBe(403);
  });
});
