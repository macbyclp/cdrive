import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({ queryRaw: vi.fn(), writable: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: m.queryRaw } }));
vi.mock("@/lib/storage", () => ({ isStorageWritable: m.writable }));

beforeEach(() => {
  vi.clearAllMocks();
  m.queryRaw.mockResolvedValue([{ 1: 1 }]);
  m.writable.mockResolvedValue(true);
});

describe("GET /api/health", () => {
  it("her şey yolundaysa 200 ve no-store", async () => {
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ status: "ok", checks: { database: true, storage: true } });
  });

  it("veritabanı hatasında 503 ve hata ayrıntısı sızdırmaz", async () => {
    const { GET } = await import("@/app/api/health/route");
    m.queryRaw.mockRejectedValue(new Error("Access denied for user 'cdrive'@'10.0.0.5'"));
    const res = await GET();
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(text).not.toContain("Access denied");
    expect(JSON.parse(text).checks).toEqual({ database: false, storage: true });
  });

  it("depolama yazılamıyorsa 503", async () => {
    const { GET } = await import("@/app/api/health/route");
    m.writable.mockResolvedValue(false);
    expect((await GET()).status).toBe(503);
  });

  it("asılı kalan veritabanı sorgusu zaman aşımıyla 503 olur", async () => {
    vi.useFakeTimers();
    try {
      const { GET } = await import("@/app/api/health/route");
      m.queryRaw.mockReturnValue(new Promise(() => {}));
      const pending = GET();
      await vi.advanceTimersByTimeAsync(3000);
      expect((await pending).status).toBe(503);
    } finally {
      vi.useRealTimers();
    }
  });
});
