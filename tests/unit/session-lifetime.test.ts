import { describe, it, expect } from "vitest";
import { sessionMaxAgeSeconds } from "@/lib/auth";

/**
 * "Beni hatırla" oturum ömrü.
 *
 * Bu değer sessizce yanlış olursa kimse fark etmez — kullanıcı ya beklenmedik
 * şekilde atılır ("beni hatırla dedim ama") ya da ortak bir bilgisayarda olması
 * gerekenden çok daha uzun süre açık kalır. İkincisi bir güvenlik sorunu, o yüzden
 * sayılar teste bağlandı.
 */

const GUN = 24 * 60 * 60;

describe("sessionMaxAgeSeconds", () => {
  it("beni hatırla İŞARETLİYSE 30 gün", () => {
    expect(sessionMaxAgeSeconds(true)).toBe(30 * GUN);
  });

  it("beni hatırla İŞARETSİZSE 1 gün", () => {
    expect(sessionMaxAgeSeconds(false)).toBe(1 * GUN);
  });

  it("değer hiç verilmemişse KISA ömre düşer (güvenli taraf)", () => {
    // Eski istemciler `remember` alanını hiç göndermiyor; varsayılan uzun olsaydı
    // herkes farkında olmadan 30 günlük oturum alırdı.
    expect(sessionMaxAgeSeconds(undefined)).toBe(1 * GUN);
  });

  it("hatırlanan oturum, hatırlanmayandan kesinlikle uzun", () => {
    expect(sessionMaxAgeSeconds(true)).toBeGreaterThan(sessionMaxAgeSeconds(false));
  });

  it("saniye cinsinden tam sayı döner (çerez maxAge tam sayı ister)", () => {
    for (const r of [true, false, undefined]) {
      const v = sessionMaxAgeSeconds(r);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
  });
});
