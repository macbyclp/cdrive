import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  requireRole: vi.fn(),
  updaterFetch: vi.fn(),
  fetchLatest: vi.fn(),
  fetchCommitVerified: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireRole: m.requireRole, AuthError: class extends Error {} }));
vi.mock("@/lib/audit", () => ({ logAudit: m.logAudit }));
vi.mock("@/lib/update", async (orig) => {
  const real = await orig<typeof import("@/lib/update")>();
  return {
    ...real,
    updaterConfig: () => ({ url: "http://u", token: "t" }),
    updaterFetch: m.updaterFetch,
    fetchLatest: m.fetchLatest,
    fetchCommitVerified: m.fetchCommitVerified,
  };
});

const SHA = "0123456789abcdef0123456789abcdef01234567";
const post = (body?: unknown) =>
  new Request("http://x/api/admin/update", { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  m.requireRole.mockResolvedValue({ id: "admin" });
  m.updaterFetch.mockResolvedValue({ state: "running" });
  m.fetchLatest.mockResolvedValue({ sha: SHA });
});

describe("POST /api/admin/update", () => {
  it("panelde görülen sha'yı updater'a iletir (dalın ucunu değil)", async () => {
    const { POST } = await import("@/app/api/admin/update/route");
    const res = await POST(post({ sha: SHA }));
    expect(res.status).toBe(202);
    expect(m.updaterFetch).toHaveBeenCalledWith(`/update?sha=${SHA}`, expect.objectContaining({ method: "POST" }));
    expect(m.fetchLatest).not.toHaveBeenCalled();
  });

  it("sha verilmezse (eski istemci) güncel ucu çözer", async () => {
    const { POST } = await import("@/app/api/admin/update/route");
    await POST(post());
    expect(m.fetchLatest).toHaveBeenCalled();
    expect(m.updaterFetch).toHaveBeenCalledWith(`/update?sha=${SHA}`, expect.anything());
  });

  it("geçersiz sha 400; updater'a gitmez", async () => {
    const { POST } = await import("@/app/api/admin/update/route");
    const res = await POST(post({ sha: "main; rm -rf /" }));
    expect(res.status).toBe(400);
    expect(m.updaterFetch).not.toHaveBeenCalled();
  });

  it("UPDATE_REQUIRE_VERIFIED açıkken imzasız commit 403 ile reddedilir", async () => {
    vi.stubEnv("UPDATE_REQUIRE_VERIFIED", "1");
    m.fetchCommitVerified.mockResolvedValue(false);
    const { POST } = await import("@/app/api/admin/update/route");
    const res = await POST(post({ sha: SHA }));
    expect(res.status).toBe(403);
    expect(m.updaterFetch).not.toHaveBeenCalled();
  });

  it("UPDATE_REQUIRE_VERIFIED açıkken imzalı commit kurulur", async () => {
    vi.stubEnv("UPDATE_REQUIRE_VERIFIED", "1");
    m.fetchCommitVerified.mockResolvedValue(true);
    const { POST } = await import("@/app/api/admin/update/route");
    expect((await POST(post({ sha: SHA }))).status).toBe(202);
  });

  it("kapalıyken imza kontrolü yapılmaz", async () => {
    const { POST } = await import("@/app/api/admin/update/route");
    await POST(post({ sha: SHA }));
    expect(m.fetchCommitVerified).not.toHaveBeenCalled();
  });
});
