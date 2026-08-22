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
