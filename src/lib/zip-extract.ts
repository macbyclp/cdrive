// ZIP arşivini hedef klasöre çıkarır — AKIŞLI: girdiler tek tek diske yazılır, arşiv ve dosyalar belleğe alınmaz
// (eski adm-zip yolu tüm arşivi bellekte tutuyordu). Klasör yapısı gerçek Folder kayıtlarıyla kurulur, her dosya normal
// yükleme kurallarıyla (yetki, politika, kota, aynı adlıysa yeni sürüm, arama metni) kaydedilir.

import { createWriteStream, promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { pipeline } from "stream/promises";
import { Transform } from "stream";
import yauzl from "yauzl";
import mime from "mime-types";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertQuota, canAccessFile, canAccessFolder } from "@/lib/access";
import { assertFilePolicy } from "@/lib/policy";
import { createFileFromKey, saveNewFileVersionFromKey } from "@/lib/file-versions";
import { extractSearchText } from "@/lib/text-extract";
import { notifyIfQuotaWarning } from "@/lib/quota-notify";
import { logAudit } from "@/lib/audit";
import { moveIntoStorage, uploadsDir } from "@/lib/storage";

// ZIP bombası koruması: girdi sayısı, ilan edilen + GERÇEK açılmış toplam boyut ve sıkıştırma oranı sınırlıdır.
export const ZIP_MAX_ENTRIES = Number(process.env.ZIP_MAX_ENTRIES || 20000);
export const ZIP_MAX_TOTAL_BYTES = Number(process.env.ZIP_MAX_TOTAL_BYTES || 20 * 1024 * 1024 * 1024);
export const ZIP_MAX_RATIO = 200;
const SEARCH_TEXT_MAX_BYTES = 25 * 1024 * 1024;

// "." / ".." parçaları klasör adı olarak oluşturulmaz (ör. "a/../b" → "a/b"; zip-slip ve sonradan indirmede yol geçişi).
function isSafeSegment(s: string) {
  return s !== "" && s !== "." && s !== "..";
}

/** Zip girdi adı: UTF-8 bayrağı yoksa ve baytlar geçerli UTF-8 değilse Türkçe Windows kod sayfasına (1254) düşer. */
export function decodeZipName(raw: string | Buffer): string {
  if (typeof raw === "string") return raw;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch {
    return new TextDecoder("windows-1254").decode(raw);
  }
}

export type ExtractResult = { filesCreated: number; foldersCreated: number; skipped: number; errors: string[] };

export async function extractZipToFolder(opts: {
  user: User;
  zipPath: string;
  zipName: string;
  rootFolderId: string | null;
}): Promise<ExtractResult> {
  const { user, zipPath, zipName, rootFolderId } = opts;
  const zip = await yauzl.openPromise(zipPath, { lazyEntries: true, decodeStrings: false, validateEntrySizes: true, autoClose: false }).catch(() => {
    throw Object.assign(new Error("Zip dosyası okunamadı (bozuk olabilir)"), { status: 400 });
  });
  if (zip.entryCount > ZIP_MAX_ENTRIES) {
    zip.close();
    throw Object.assign(new Error(`Zip en fazla ${ZIP_MAX_ENTRIES} girdi içerebilir`), { status: 400 });
  }

  const folderCache = new Map<string, string | null>([["", rootFolderId]]);
  let filesCreated = 0;
  let foldersCreated = 0;
  let skipped = 0;
  const errors: string[] = [];
  let totalWritten = 0;

  async function ensureFolderPath(dirPath: string): Promise<string | null> {
    if (folderCache.has(dirPath)) return folderCache.get(dirPath)!;
    const parts = dirPath.split("/").filter(isSafeSegment);
    let currentPath = "";
    let currentParentId = rootFolderId;
    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      if (folderCache.has(currentPath)) {
        currentParentId = folderCache.get(currentPath)!;
        continue;
      }
      // Kökte yalnızca kullanıcının KENDİ klasörü eşleşir; başkasının aynı adlı kök klasörüne yazılamaz.
      const existing = await prisma.folder.findFirst({
        where: { name: part, parentId: currentParentId, deletedAt: null, ...(currentParentId === null ? { ownerId: user.id } : {}) },
      });
      if (existing) {
        if (currentParentId !== null && !(await canAccessFolder(user, existing.id, "EDIT"))) throw new Error(`"${part}" klasörüne yazma izniniz yok`);
        currentParentId = existing.id;
      } else {
        const parent = currentParentId ? await prisma.folder.findUnique({ where: { id: currentParentId } }) : null;
        const created = await prisma.folder.create({
          data: {
            name: part,
            parentId: currentParentId,
            ownerId: user.id,
            departmentId: parent?.departmentId ?? (user.role === "MANAGER" ? user.departmentId : null),
          },
        });
        currentParentId = created.id;
        foldersCreated++;
      }
      folderCache.set(currentPath, currentParentId);
    }
    return currentParentId;
  }

  async function handleFile(entry: yauzl.Entry, fullPath: string) {
    const segments = fullPath.split("/").filter(isSafeSegment);
    const name = segments.pop();
    if (!name || name.startsWith(".")) {
      skipped++;
      return;
    }
    const declared = entry.uncompressedSize;
    const packed = entry.compressedSize;
    if (declared > ZIP_MAX_TOTAL_BYTES || totalWritten + declared > ZIP_MAX_TOTAL_BYTES) throw new Error("Toplam boyut sınırı aşıldı");
    if (packed > 0 && declared / packed > ZIP_MAX_RATIO && declared > 1024 * 1024) throw new Error("Şüpheli ölçüde sıkıştırılmış");
    const mimeType = mime.lookup(name) || "application/octet-stream";
    const size = BigInt(declared);
    await assertFilePolicy(name, size);
    await assertQuota(user, size);
    const parentId = await ensureFolderPath(segments.join("/"));

    // Girdi diske akıtılır; GERÇEK bayt sayısı ilan edilenle sınırlıdır (yalan söyleyen başlık disk doldurmasın).
    const tmp = path.join(await uploadsDir(), `${randomUUID()}.zipentry`);
    let bytes = 0;
    try {
      const stream = await zip.openReadStreamPromise(entry);
      const limiter = new Transform({
        transform(chunk: Buffer, _enc, cb) {
          bytes += chunk.length;
          totalWritten += chunk.length;
          if (bytes > declared || totalWritten > ZIP_MAX_TOTAL_BYTES) return cb(new Error("Açılan veri ilan edilen boyutu aştı"));
          cb(null, chunk);
        },
      });
      await pipeline(stream, limiter, createWriteStream(tmp));
      const searchText = declared <= SEARCH_TEXT_MAX_BYTES ? await extractSearchText(await fs.readFile(tmp), mimeType).catch(() => null) : null;
      const finalSize = BigInt(bytes);
      const existing = await prisma.file.findFirst({
        where: { folderId: parentId, name, deletedAt: null, ...(parentId === null ? { ownerId: user.id } : {}) },
      });
      // İzin denetimi, dosya kalıcı depolamaya ALINMADAN önce yapılır (reddedilirse geçici dosya zaten siliniyor).
      if (existing && !(await canAccessFile(user, existing.id, "EDIT"))) throw new Error("Aynı adlı dosyayı değiştirme izniniz yok");
      const storageKey = await moveIntoStorage(tmp);
      if (existing) {
        await saveNewFileVersionFromKey(existing, { storageKey, size: finalSize, searchText }, user.id, { mimeType });
      } else {
        await createFileFromKey({ name, mimeType, folderId: parentId, ownerId: user.id, storageKey, size: finalSize, searchText });
      }
      filesCreated++;
    } finally {
      await fs.rm(tmp, { force: true }).catch(() => {});
    }
  }

  try {
    await new Promise<void>((resolve, reject) => {
      zip.on("error", reject);
      zip.on("end", () => resolve());
      zip.on("entry", (entry: yauzl.Entry) => {
        void (async () => {
          const fullPath = decodeZipName(entry.fileName as unknown as string | Buffer)
            .split(String.fromCharCode(92))
            .join("/");
          try {
            if (fullPath.endsWith("/")) {
              await ensureFolderPath(fullPath.replace(/\/+$/, ""));
            } else {
              await handleFile(entry, fullPath);
            }
          } catch (e) {
            skipped++;
            if (errors.length < 10) errors.push(`${fullPath}: ${e instanceof Error ? e.message : "bilinmeyen hata"}`);
          }
          zip.readEntry();
        })().catch(reject);
      });
      zip.readEntry();
    });
  } finally {
    zip.close();
  }

  await notifyIfQuotaWarning(user.id);
  await logAudit({
    userId: user.id,
    action: "UPLOAD",
    targetType: "folder",
    targetId: rootFolderId ?? undefined,
    detail: `${zipName}: ${filesCreated} dosya, ${foldersCreated} klasör çıkarıldı${skipped ? `, ${skipped} atlandı` : ""}`,
  });
  return { filesCreated, foldersCreated, skipped, errors };
}
