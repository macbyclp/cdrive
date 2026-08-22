import { describe, it, expect } from "vitest";
import { shareLinkStatus, type ShareLinkGate } from "@/lib/share";

/**
 * Paylaşım bağlantısı kapısı. Bu, uygulamanın oturum gerektirmeyen TEK yüzeyi —
 * buradaki bir gevşeklik doğrudan yetkisiz dosya erişimi demek, o yüzden kenar
 * durumlar (tam sınırda süre, tam sınırda indirme sayısı, limitsiz bağlantı)
 * ayrı ayrı test ediliyor.
 */

const SIMDI = new Date("2026-08-22T12:00:00Z");

function link(over: Partial<ShareLinkGate> = {}): ShareLinkGate {
  return { revoked: false, expiresAt: null, maxDownloads: null, downloadCount: 0, ...over };
}

describe("shareLinkStatus — geçerli bağlantı", () => {
  it("kısıtsız bağlantıya izin verir", () => {
    expect(shareLinkStatus(link(), SIMDI)).toEqual({ ok: true });
  });

  it("süresi henüz dolmamış bağlantıya izin verir", () => {
    const sonra = new Date("2026-08-23T12:00:00Z");
    expect(shareLinkStatus(link({ expiresAt: sonra }), SIMDI).ok).toBe(true);
  });

  it("limiti henüz dolmamış bağlantıya izin verir", () => {
    expect(shareLinkStatus(link({ maxDownloads: 5, downloadCount: 4 }), SIMDI).ok).toBe(true);
  });
});

describe("shareLinkStatus — reddetme durumları", () => {
  it("bağlantı yoksa 404 döner (token uydurma girişimi)", () => {
    const s = shareLinkStatus(null, SIMDI);
    expect(s).toMatchObject({ ok: false, reason: "revoked", status: 404 });
  });

  it("undefined için de 404 döner", () => {
    expect(shareLinkStatus(undefined, SIMDI).ok).toBe(false);
  });

  it("iptal edilmiş bağlantıyı reddeder", () => {
    const s = shareLinkStatus(link({ revoked: true }), SIMDI);
    expect(s).toMatchObject({ ok: false, reason: "revoked", status: 404 });
  });

  it("süresi dolmuş bağlantıyı 410 ile reddeder", () => {
    const once = new Date("2026-08-21T12:00:00Z");
    const s = shareLinkStatus(link({ expiresAt: once }), SIMDI);
    expect(s).toMatchObject({ ok: false, reason: "expired", status: 410 });
  });

  it("indirme limiti dolmuş bağlantıyı 410 ile reddeder", () => {
    const s = shareLinkStatus(link({ maxDownloads: 3, downloadCount: 3 }), SIMDI);
    expect(s).toMatchObject({ ok: false, reason: "limit", status: 410 });
  });

  it("limit AŞILMIŞSA da reddeder (yarış durumu sonrası)", () => {
    // Eşzamanlı iki indirme sayacı limitin üstüne çıkarabilir; >= kullanıldığı için
    // bu durum da kapatılmalı.
    expect(shareLinkStatus(link({ maxDownloads: 3, downloadCount: 7 }), SIMDI).ok).toBe(false);
  });

  it("iptal, süre dolumundan ÖNCE değerlendirilir", () => {
    // İkisi birden geçersizse en kesin sebep (iptal) bildirilmeli.
    const once = new Date("2026-08-01T00:00:00Z");
    const s = shareLinkStatus(link({ revoked: true, expiresAt: once }), SIMDI);
    expect(s).toMatchObject({ reason: "revoked" });
  });
});

describe("shareLinkStatus — sınır durumları", () => {
  it("tam sona erme anında HENÜZ geçerlidir (kesin küçüktür karşılaştırması)", () => {
    // expiresAt < now olduğunda dolmuş sayılıyor; tam eşitlikte hâlâ geçerli.
    expect(shareLinkStatus(link({ expiresAt: SIMDI }), SIMDI).ok).toBe(true);
  });

  it("bir milisaniye sonrasında dolmuş sayılır", () => {
    const birMsOnce = new Date(SIMDI.getTime() - 1);
    expect(shareLinkStatus(link({ expiresAt: birMsOnce }), SIMDI).ok).toBe(false);
  });

  it("maxDownloads=0 limitsiz sayılır, bağlantıyı kilitlemez", () => {
    // 0 falsy olduğu için kontrol atlanıyor — "limit yok" anlamına geliyor.
    // Bu davranış bilinçli: limit koymak isteyen en az 1 girer.
    expect(shareLinkStatus(link({ maxDownloads: 0, downloadCount: 99 }), SIMDI).ok).toBe(true);
  });
});
