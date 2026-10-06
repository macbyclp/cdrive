import { describe, it, expect } from "vitest";
import { shouldTouchSession } from "@/lib/auth";
import { wantsExpiryWarning } from "@/lib/link-expiry";

describe("shouldTouchSession", () => {
  const now = Date.now();
  it("5 dakikadan eski 'son görülme' güncellenir, daha yenisi güncellenmez", () => {
    expect(shouldTouchSession(new Date(now - 6 * 60_000), now)).toBe(true);
    expect(shouldTouchSession(new Date(now - 5 * 60_000), now)).toBe(true);
    expect(shouldTouchSession(new Date(now - 4 * 60_000), now)).toBe(false);
    expect(shouldTouchSession(new Date(now - 1000), now)).toBe(false);
  });
  it("tarih yoksa/geçersizse yazmaz (hata fırlatmaz)", () => {
    expect(shouldTouchSession(undefined, now)).toBe(false);
    expect(shouldTouchSession(null, now)).toBe(false);
  });
});

describe("wantsExpiryWarning", () => {
  const created = new Date("2026-01-01T00:00:00Z");
  it("uyarı penceresinden (48 sa) uzun ömürlü bağlantı uyarılır", () => {
    expect(wantsExpiryWarning(created, new Date("2026-01-08T00:00:00Z"))).toBe(true);
  });
  it("kısa ömürlü (1 saat, 2 gün) bağlantı uyarılmaz — sahibi süreyi az önce kendisi seçti", () => {
    expect(wantsExpiryWarning(created, new Date("2026-01-01T01:00:00Z"))).toBe(false);
    expect(wantsExpiryWarning(created, new Date("2026-01-03T00:00:00Z"))).toBe(false); // tam 48 sa
  });
});
