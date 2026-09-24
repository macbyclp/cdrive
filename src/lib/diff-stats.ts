export type DiffPart = { added: boolean; removed: boolean; value: string };

/**
 * Bir diff parçasını satırlara böler. `diffLines` her satırı "\n" ile bitirdiği için
 * sondaki boş parça atılır (tek satırlık, sonu "\n" olmayan parça korunur).
 */
export function partLines(value: string): string[] {
  const lines = value.split("\n");
  return lines.length > 1 && lines[lines.length - 1] === "" ? lines.slice(0, -1) : lines;
}

/** Eklenen / silinen satır sayısı — sürüm farkı özetinde gösterilir. */
export function diffLineStats(parts: DiffPart[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const p of parts) {
    if (p.added) added += partLines(p.value).length;
    else if (p.removed) removed += partLines(p.value).length;
  }
  return { added, removed };
}
