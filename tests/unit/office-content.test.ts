import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({ findUnique: vi.fn(), serve: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { fileVersion: { findUnique: m.findUnique } } }));
vi.mock("@/lib/http-range", () => ({ serveStoredFile: m.serve }));

import { GET } from "@/app/api/files/[id]/office/content/route";
import { signOfficeContentToken } from "@/lib/onlyoffice";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  m.serve.mockResolvedValue(new Response("x", { status: 206 }));
});

describe("OnlyOffice content uç noktası", () => {
  it("token yoksa 401", async () => {
    expect((await GET(new Request("http://x/api/files/f1/office/content"), ctx("f1"))).status).toBe(401);
  });
  it("başka dosya için imzalanmış token 401", async () => {
    const token = await signOfficeContentToken({ fileId: "baska", versionId: "v1", userId: "u1" });
    expect((await GET(new Request(`http://x/c?token=${token}`), ctx("f1"))).status).toBe(401);
  });
  it("versiyon başka dosyaya aitse 404", async () => {
    const token = await signOfficeContentToken({ fileId: "f1", versionId: "v1", userId: "u1" });
    m.findUnique.mockResolvedValue({ id: "v1", fileId: "diger", storageKey: "k" });
    expect((await GET(new Request(`http://x/c?token=${token}`), ctx("f1"))).status).toBe(404);
  });
  it("geçerli token akışlı sunucuya (Range destekli) devredilir", async () => {
    const token = await signOfficeContentToken({ fileId: "f1", versionId: "v1", userId: "u1" });
    m.findUnique.mockResolvedValue({ id: "v1", fileId: "f1", storageKey: "k" });
    const req = new Request(`http://x/c?token=${token}`, { headers: { range: "bytes=0-9" } });
    const res = await GET(req, ctx("f1"));
    expect(res.status).toBe(206);
    expect(m.serve).toHaveBeenCalledWith(req, expect.objectContaining({ storageKey: "k" }));
  });
});
