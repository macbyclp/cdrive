import { prisma } from "@/lib/prisma";

/** "rapor.pdf" → ["rapor", ".pdf"]; uzantısız veya nokta ile başlayan adlarda uzantı boş. */
function splitExt(name: string): [string, string] {
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? [name, ""] : [name.slice(0, dot), name.slice(dot)];
}

/** Kopya için önerilen ad: "rapor.pdf" → "rapor (kopya).pdf". */
export function copyNameFor(name: string): string {
  const [stem, ext] = splitExt(name);
  return `${stem} (kopya)${ext}`;
}

/**
 * `exists` doğru döndükçe "ad (2).ext", "ad (3).ext" ... dener ve ilk boş adı döner.
 * Saf fonksiyon — veritabanı kontrolü çağırandan gelir (bkz. uniqueFileName).
 */
export async function firstFreeName(baseName: string, exists: (name: string) => Promise<boolean>): Promise<string> {
  const [stem, ext] = splitExt(baseName);
  let name = baseName;
  for (let n = 2; await exists(name); n++) name = `${stem} (${n})${ext}`;
  return name;
}

/** Klasörde (çöpte olmayan) aynı adlı dosya varsa adı benzersizleştirir. */
export function uniqueFileName(folderId: string | null, baseName: string): Promise<string> {
  return firstFreeName(baseName, async (name) => !!(await prisma.file.findFirst({ where: { folderId, name, deletedAt: null } })));
}
