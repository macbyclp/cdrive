// ZIP bombası ve yol-geçişi korumaları (saf fonksiyonlar — test edilebilir). zip-upload rotası, hiçbir şey
// belleğe açılmadan ÖNCE girdi sayısını, ilan edilen toplam boyutu ve sıkıştırma oranını sınırlar.

export const ZIP_MAX_ENTRIES = 5000;
export const ZIP_MAX_RATIO = 200;
/** Oran kontrolü yalnız bu boyutun üzerindeki girdilere uygulanır (küçük, çok sıkışan dosyalar zararsız). */
export const ZIP_RATIO_MIN_BYTES = 1024 * 1024;

export type ZipEntryInfo = { isDirectory: boolean; size: number; compressedSize: number };

export function zipMaxTotalBytes(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.ZIP_MAX_TOTAL_BYTES);
  return Number.isFinite(n) && n > 0 ? n : 2 * 1024 * 1024 * 1024;
}

/** Uygunsuzsa kullanıcıya gösterilecek hata metnini, uygunsa null döner. */
export function inspectZipEntries(entries: ZipEntryInfo[], maxTotal: number = zipMaxTotalBytes()): string | null {
  if (entries.length > ZIP_MAX_ENTRIES) return `Zip en fazla ${ZIP_MAX_ENTRIES} girdi içerebilir`;
  let declaredTotal = 0;
  for (const e of entries) {
    if (e.isDirectory) continue;
    declaredTotal += e.size;
    const suspicious = e.compressedSize > 0 && e.size / e.compressedSize > ZIP_MAX_RATIO && e.size > ZIP_RATIO_MIN_BYTES;
    if (declaredTotal > maxTotal || suspicious) return "Zip içeriği çok büyük veya şüpheli ölçüde sıkıştırılmış";
  }
  return null;
}

/** "." / ".." ve boş parçalar klasör adı olarak kullanılmaz (zip slip). */
export function isSafeZipSegment(s: string): boolean {
  return s !== "" && s !== "." && s !== "..";
}

/** Girdi yolunu güvenli parçalara böler (ters eğik çizgi normalleştirilir, "." / ".." atılır). */
export function safeZipPath(entryName: string): string[] {
  return entryName.replace(/\\/g, "/").split("/").filter(isSafeZipSegment);
}
