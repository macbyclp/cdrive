// "Dosya isteği" (hesapsız yükleme bağlantısı) — saf yardımcılar (test edilebilir).

export type UploadRequestGate = {
  revoked: boolean;
  expiresAt: Date;
  maxFiles: number;
  uploadCount: number;
};

export type UploadRequestStatus =
  | { ok: true }
  | { ok: false; reason: "revoked" | "expired" | "full"; error: string; status: 404 | 410 };

/** Bağlantının şu an dosya kabul edip etmediği (iptal / süre / dosya sayısı). Şifre ayrıca çağıranda doğrulanır. */
export function uploadRequestStatus(r: UploadRequestGate | null | undefined, now: Date = new Date()): UploadRequestStatus {
  if (!r || r.revoked) return { ok: false, reason: "revoked", error: "Bağlantı geçersiz veya iptal edilmiş", status: 404 };
  if (r.expiresAt < now) return { ok: false, reason: "expired", error: "Bağlantının süresi dolmuş", status: 410 };
  if (r.uploadCount >= r.maxFiles) return { ok: false, reason: "full", error: "Bu istek için dosya sayısı sınırına ulaşıldı", status: 410 };
  return { ok: true };
}

/** Yükleyenin verdiği ad: denetim karakterlerini ve yol parçalarını atar, uzunluğu sınırlar. */
export function sanitizeUploadName(raw: string): string {
  let name = raw.replace(/[\u0000-\u001f\u007f]/g, "").replace(/[\\/]/g, "_").trim();
  if (name === "." || name === "..") name = "";
  if (name.length > 200) {
    const dot = name.lastIndexOf(".");
    const ext = dot > 0 && name.length - dot <= 12 ? name.slice(dot) : "";
    name = name.slice(0, 200 - ext.length) + ext;
  }
  return name || "dosya";
}

/**
 * Aynı klasörde çakışmayan ad: "rapor.pdf" doluysa "rapor (2).pdf", "rapor (3).pdf"… Anonim yükleyen
 * mevcut bir dosyanın ÜZERİNE yeni sürüm yazamaz (kullanıcı yüklemesindeki sürümleme burada kapalıdır).
 */
export function uniqueName(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(name)) return name;
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let n = 2; n < 10_000; n++) {
    const candidate = `${base} (${n})${ext}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base} (${Date.now()})${ext}`;
}
