import { afterEach, describe, expect, it, vi } from "vitest";
import { currentVersion, shortSha, summarizeCompare, updaterConfig, updaterFetch, UpdaterError, isFullSha, requireVerifiedCommits } from "@/lib/update";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("summarizeCompare", () => {
  it("commit'leri en yeni üstte sıralar, ilk satırı alır ve sayıyı döner", () => {
    const r = summarizeCompare({
      status: "ahead",
      ahead_by: 2,
      commits: [
        { sha: "a1", commit: { message: "eski\n\nayrıntı", author: { name: "Ali", date: "2026-01-01T00:00:00Z" } } },
        { sha: "b2", commit: { message: "yeni", author: { name: "Veli", date: "2026-01-02T00:00:00Z" } } },
      ],
    });
    expect(r.ahead).toBe(2);
    expect(r.relation).toBe("ahead");
    expect(r.commits.map((c) => c.sha)).toEqual(["b2", "a1"]);
    expect(r.commits[1].message).toBe("eski");
  });

  it("bilinmeyen durumu 'unknown' yapar", () => {
    expect(summarizeCompare({}).relation).toBe("unknown");
    expect(summarizeCompare({ status: "wat" }).relation).toBe("unknown");
    expect(summarizeCompare({ status: "diverged", ahead_by: 1 }).relation).toBe("diverged");
  });
});

describe("currentVersion / shortSha", () => {
  it("APP_COMMIT 'unknown' ise commit yok sayılır", () => {
    vi.stubEnv("APP_COMMIT", "unknown");
    expect(currentVersion().commit).toBeNull();
    vi.stubEnv("APP_COMMIT", "0123456789abcdef");
    expect(currentVersion().commit).toBe("0123456789abcdef");
    expect(shortSha("0123456789abcdef")).toBe("0123456");
    expect(shortSha(null)).toBe("?");
  });
});

describe("updaterConfig / updaterFetch", () => {
  it("URL ve belirteç yoksa yapılandırılmamış sayılır", () => {
    vi.stubEnv("UPDATER_URL", "");
    vi.stubEnv("UPDATER_TOKEN", "");
    expect(updaterConfig()).toBeNull();
  });

  it("URL sonundaki eğik çizgiyi atar", () => {
    vi.stubEnv("UPDATER_URL", "http://updater:9000///");
    vi.stubEnv("UPDATER_TOKEN", "x".repeat(32));
    expect(updaterConfig()).toEqual({ url: "http://updater:9000", token: "x".repeat(32) });
  });

  it("Bearer belirteciyle istek atar ve 409'u korur", async () => {
    vi.stubEnv("UPDATER_URL", "http://updater:9000");
    vi.stubEnv("UPDATER_TOKEN", "t".repeat(30));
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "sürüyor" }), { status: 409 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(updaterFetch("/update", { method: "POST" })).rejects.toMatchObject({ status: 409, message: "sürüyor" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://updater:9000/update");
    expect((init as RequestInit).headers).toEqual({ Authorization: `Bearer ${"t".repeat(30)}` });
  });

  it("ulaşılamazsa UpdaterError fırlatır", async () => {
    vi.stubEnv("UPDATER_URL", "http://updater:9000");
    vi.stubEnv("UPDATER_TOKEN", "t".repeat(30));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    await expect(updaterFetch("/status")).rejects.toBeInstanceOf(UpdaterError);
  });
});

describe("isFullSha / requireVerifiedCommits", () => {
  it("yalnız 40 haneli küçük harf hex sha kabul edilir (komut enjeksiyonu yok)", () => {
    expect(isFullSha("0123456789abcdef0123456789abcdef01234567")).toBe(true);
    for (const bad of ["main", "0123456", "0123456789ABCDEF0123456789ABCDEF01234567", "x".repeat(40), "a".repeat(39) + ";", "", undefined, 5]) {
      expect(isFullSha(bad)).toBe(false);
    }
  });

  it("UPDATE_REQUIRE_VERIFIED yalnız '1' iken açıktır", () => {
    vi.stubEnv("UPDATE_REQUIRE_VERIFIED", "");
    expect(requireVerifiedCommits()).toBe(false);
    vi.stubEnv("UPDATE_REQUIRE_VERIFIED", "1");
    expect(requireVerifiedCommits()).toBe(true);
  });
});

describe("summarizeCompare — imza bilgisi", () => {
  it("GitHub verification.verified değerini taşır; yoksa null", () => {
    const r = summarizeCompare({
      status: "ahead",
      ahead_by: 2,
      commits: [
        { sha: "a1", commit: { message: "m", verification: { verified: true } } },
        { sha: "b2", commit: { message: "m" } },
      ],
    });
    expect(r.commits.find((c) => c.sha === "a1")!.verified).toBe(true);
    expect(r.commits.find((c) => c.sha === "b2")!.verified).toBeNull();
  });
});
