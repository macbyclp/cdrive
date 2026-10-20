// Seçili dosya/klasörleri akışlı ZIP'e paketler (indirme ve "sürücüde ZIP oluştur" için ortak).
// Dosyalar diskten sırayla okunup arşive akıtılır; arşiv ve dosyalar belleğe alınmaz.

import { ZipArchive } from "archiver";
import type { Readable } from "stream";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canAccessFile, canAccessFolder } from "@/lib/access";
import { openReadStream, statFile } from "@/lib/storage";
import { dedupeZipPath, safeZipSegment } from "@/lib/download-names";

export type ZipEntry = { path: string; storageKey: string; size: number };

export const ZIP_PACK_MAX_ENTRIES = 100_000;
export const ZIP_PACK_MAX_BYTES = Number(process.env.ZIP_PACK_MAX_BYTES || 20 * 1024 * 1024 * 1024);

export class PackError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

async function collectFolderTree(folderId: string, basePath: string, used: Set<string>, out: ZipEntry[]): Promise<void> {
  const [files, subfolders] = await Promise.all([
    prisma.file.findMany({ where: { folderId, deletedAt: null }, include: { currentVersion: true } }),
    prisma.folder.findMany({ where: { parentId: folderId, deletedAt: null } }),
  ]);
  for (const f of files) {
    if (!f.currentVersion) continue;
    out.push({ path: dedupeZipPath(`${basePath}${safeZipSegment(f.name)}`, used), storageKey: f.currentVersion.storageKey, size: Number(f.currentVersion.size) });
    if (out.length > ZIP_PACK_MAX_ENTRIES) throw new PackError("Seçimde çok fazla dosya var", 413);
  }
  for (const sf of subfolders) await collectFolderTree(sf.id, `${basePath}${safeZipSegment(sf.name)}/`, used, out);
}

/**
 * Seçimdeki dosya ve klasörleri, KULLANICININ yetkisiyle toplar: görüntüleme izni olmayan öğe seçimi tüm isteği reddeder
 * (sessizce atlanmaz — kullanıcı eksik arşiv aldığını sanmasın).
 */
export async function collectSelection(user: User, input: { fileIds?: string[]; folderIds?: string[] }) {
  const fileIds = [...new Set(input.fileIds ?? [])];
  const folderIds = [...new Set(input.folderIds ?? [])];
  if (fileIds.length + folderIds.length === 0) throw new PackError("Hiçbir öğe seçilmedi");
  if (fileIds.length + folderIds.length > 5000) throw new PackError("Tek seferde en fazla 5000 öğe seçilebilir");

  const used = new Set<string>();
  const entries: ZipEntry[] = [];
  const labels: string[] = [];

  for (const id of fileIds) {
    if (!(await canAccessFile(user, id, "VIEW"))) throw new PackError("Seçilen dosyalardan birine erişim izniniz yok", 403);
    const f = await prisma.file.findUnique({ where: { id }, include: { currentVersion: true } });
    if (!f || f.deletedAt || !f.currentVersion) throw new PackError("Seçilen dosyalardan biri bulunamadı", 404);
    entries.push({ path: dedupeZipPath(safeZipSegment(f.name), used), storageKey: f.currentVersion.storageKey, size: Number(f.currentVersion.size) });
    labels.push(f.name);
  }
  for (const id of folderIds) {
    if (!(await canAccessFolder(user, id, "VIEW"))) throw new PackError("Seçilen klasörlerden birine erişim izniniz yok", 403);
    const folder = await prisma.folder.findUnique({ where: { id } });
    if (!folder || folder.deletedAt) throw new PackError("Seçilen klasörlerden biri bulunamadı", 404);
    await collectFolderTree(id, `${dedupeZipPath(safeZipSegment(folder.name), used)}/`, used, entries);
    labels.push(folder.name);
  }
  const totalBytes = entries.reduce((s, e) => s + e.size, 0);
  if (totalBytes > ZIP_PACK_MAX_BYTES) throw new PackError("Seçim çok büyük (ZIP için üst sınır aşıldı)", 413);
  return { entries, totalBytes, label: labels.length === 1 ? labels[0] : "Cdrive-arsiv" };
}

/** Girdileri sırayla arşive ekler (aynı anda binlerce açık dosya tanıtıcısı olmasın); diskte olmayan içerik atlanır. */
export function buildArchive(entries: ZipEntry[], level = 6): { archive: ZipArchive; stream: Readable } {
  const archive = new ZipArchive({ zlib: { level } });
  archive.on("warning", (e: Error) => console.warn("zip uyarı:", e.message));
  archive.on("error", (e: Error) => console.error("zip hata:", e));
  void (async () => {
    for (const entry of entries) {
      try {
        await statFile(entry.storageKey);
      } catch {
        continue;
      }
      const processed = new Promise<void>((resolve) => archive.once("entry", () => resolve()));
      archive.append(openReadStream(entry.storageKey), { name: entry.path });
      await processed;
    }
    await archive.finalize();
  })().catch((e: Error) => archive.destroy(e));
  return { archive, stream: archive as unknown as Readable };
}
