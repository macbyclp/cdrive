/**
 * Paylaşım bağlantısı geçerlilik kontrolü — TEK KAYNAK.
 *
 * Aynı üç kontrol (iptal / süre dolmuş / indirme limiti) daha önce
 * /api/share/[token], /api/share/[token]/info ve /api/share/[token]/verify
 * rotalarında birebir kopyalanmıştı. Bu, uygulamanın OTURUM GEREKTİRMEYEN tek
 * yüzeyi — bir kopyada unutulan kontrol, iptal edilmiş ya da süresi dolmuş bir
 * bağlantının o uçtan çalışmaya devam etmesi demek. O yüzden buraya toplandı.
 *
 * Şifre kontrolü bilerek BURAYA DAHİL DEĞİL: bcrypt karşılaştırması async'tir ve
 * her uç noktada farklı davranır (info şifreyi hiç sormaz, sadece
 * `requiresPassword` bayrağını döner), o yüzden çağıran tarafta kalıyor.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { resolveSecret } from "@/lib/session-secret";

/**
 * İndirme limiti dolduktan sonra yalnız GERÇEKTEN başlamış bir indirmenin devamı (Range) kabul
 * edilir. Bunun kanıtı, ilk (sayılan) istekte verilen kısa ömürlü, imzalı çerezdir; başlığa
 * bakarak "devam" saymak (ör. `bytes=00-`) limiti aşmaya izin veriyordu.
 */
export const SHARE_PROOF_TTL_S = 3600;

function proofSig(linkId: string, exp: number): string {
  return createHmac("sha256", resolveSecret()).update(`share-dl:${linkId}:${exp}`).digest("hex");
}

export function shareProofCookieName(linkId: string): string {
  return `shdl_${linkId.slice(-12)}`;
}

export function makeShareProof(linkId: string, nowMs: number = Date.now()): string {
  const exp = Math.floor(nowMs / 1000) + SHARE_PROOF_TTL_S;
  return `${exp}.${proofSig(linkId, exp)}`;
}

export function verifyShareProof(linkId: string, value: string | null | undefined, nowMs: number = Date.now()): boolean {
  if (!value) return false;
  const [expRaw, sig] = value.split(".");
  const exp = Number(expRaw);
  if (!Number.isInteger(exp) || !sig || exp * 1000 < nowMs) return false;
  const want = Buffer.from(proofSig(linkId, exp));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

export type ShareLinkGate = {
  revoked: boolean;
  expiresAt: Date | null;
  maxDownloads: number | null;
  downloadCount: number;
};

export type ShareLinkStatus =
  | { ok: true }
  | { ok: false; reason: "revoked" | "expired" | "limit"; error: string; status: 404 | 410 };

/**
 * Bağlantının indirilebilir olup olmadığını söyler. `now` parametresi testler için
 * dışarıdan verilebilir; üretimde çağıranlar vermez (varsayılan: şu an).
 */
export function shareLinkStatus(link: ShareLinkGate | null | undefined, now: Date = new Date()): ShareLinkStatus {
  if (!link || link.revoked) {
    return { ok: false, reason: "revoked", error: "Bağlantı geçersiz veya iptal edilmiş", status: 404 };
  }
  if (link.expiresAt && link.expiresAt < now) {
    return { ok: false, reason: "expired", error: "Bağlantının süresi dolmuş", status: 410 };
  }
  if (link.maxDownloads && link.downloadCount >= link.maxDownloads) {
    return { ok: false, reason: "limit", error: "İndirme limitine ulaşıldı", status: 410 };
  }
  return { ok: true };
}

/**
 * Denetim kaydına yazılacak, GİZLİ olmayan token işareti. Tam token bir erişim anahtarıdır; kaydı
 * okuyan biri (ör. yönetici) onunla dosyayı indirebilirdi. Son 6 karakter, kaydı bir bağlantıyla
 * eşleştirmeye yetecek kadardır.
 */
export function maskToken(token: string): string {
  return token.length <= 6 ? "…" : `…${token.slice(-6)}`;
}
