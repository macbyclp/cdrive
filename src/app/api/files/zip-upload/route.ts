import { NextResponse } from "next/server";
import AdmZip from "adm-zip";
import mime from "mime-types";
import { prisma } from "@/lib/prisma";
import { requireUnrestrictedUser } from "@/lib/auth";
import { canAccessFolder, canAccessFile, assertQuota } from "@/lib/access";
import { extractSearchText } from "@/lib/text-extract";
import { assertFilePolicy } from "@/lib/policy";
import { saveNewFileVersion, createFileFromBuffer } from "@/lib/file-versions";
import { notifyIfQuotaWarning } from "@/lib/quota-notify";
import { logAudit } from "@/lib/audit";
import { errorResponse, limitOr429 } from "@/lib/api-helpers";
import { inspectZipEntries, isSafeZipSegment as isSafeSegment, safeZipPath, zipMaxTotalBytes } from "@/lib/zip-guard";

/**
 * Bir .zip dosyasını hedef klasöre çıkarır: içindeki klasör yapısını gerçek
 * Folder kayıtlarıyla yeniden kurar, dosyaları normal yükleme akışıyla
 * (versiyon/quota/politika/arama metni dahil) tek tek işler.
 */
const ZIP_MAX_TOTAL_BYTES = zipMaxTotalBytes();

export async function POST(req: Request) {
  try {
    const user = await requireUnrestrictedUser();
    const limited = limitOr429("zipupload", user.id, 10, 60000);
    if (limited) return limited;
    const form = await req.formData();
    const zipFileRaw = form.get("file");
    const rootFolderIdRaw = form.get("folderId");
    const rootFolderId = typeof rootFolderIdRaw === "string" && rootFolderIdRaw.length > 0 ? rootFolderIdRaw : null;

    if (!(zipFileRaw instanceof File)) {
      return NextResponse.json({ error: "Zip dosyası bulunamadı" }, { status: 400 });
    }
    if (!zipFileRaw.name.toLowerCase().endsWith(".zip")) {
      return NextResponse.json({ error: "Sadece .zip dosyaları desteklenir" }, { status: 400 });
    }

    if (rootFolderId) {
      const ok = await canAccessFolder(user, rootFolderId, "EDIT");
      if (!ok) return NextResponse.json({ error: "Bu klasöre yükleme izniniz yok" }, { status: 403 });
    }

    const zipBuffer = Buffer.from(await zipFileRaw.arrayBuffer());
    let zip: AdmZip;
    try {
      zip = new AdmZip(zipBuffer);
    } catch {
      return NextResponse.json({ error: "Zip dosyası okunamadı (bozuk olabilir)" }, { status: 400 });
    }

    const entries = zip.getEntries();
    const problem = inspectZipEntries(
      entries.map((e) => ({ isDirectory: e.isDirectory, size: e.header.size, compressedSize: e.header.compressedSize })),
      ZIP_MAX_TOTAL_BYTES
    );
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    // Dizin yolu ("a/b") -> Folder id eşlemesi; kök = yüklemenin hedef klasörü.
    const folderCache = new Map<string, string | null>([["", rootFolderId]]);

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
          // Alt klasörlerde de her eşleşen mevcut klasör için EDIT izni doğrulanır.
          if (currentParentId !== null && !(await canAccessFolder(user, existing.id, "EDIT"))) {
            throw new Error(`"${part}" klasörüne yazma izniniz yok`);
          }
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
        }
        folderCache.set(currentPath, currentParentId);
      }
      return currentParentId;
    }

    let extractedTotal = 0;
    let filesCreated = 0;
    let foldersCreated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const entry of entries) {
      if (entry.isDirectory) {
        const before = folderCache.size;
        await ensureFolderPath(entry.entryName.replace(/\/$/, ""));
        if (folderCache.size > before) foldersCreated++;
        continue;
      }

      const fullPath = entry.entryName.replace(/\\/g, "/");
      const segments = safeZipPath(entry.entryName);
      const name = segments.pop();
      if (!name || name.startsWith(".")) {
        skipped++;
        continue;
      }
      const dirPath = segments.join("/");

      try {
        const parentId = await ensureFolderPath(dirPath);
        if (entry.header.size > ZIP_MAX_TOTAL_BYTES) throw new Error("Dosya çok büyük");
        const buffer = entry.getData();
        // İlan edilen boyut sahte olabilir: GERÇEKTEN açılan toplam da sınırlanır.
        extractedTotal += buffer.byteLength;
        if (extractedTotal > ZIP_MAX_TOTAL_BYTES) throw new Error("Zip içeriği izin verilen toplam boyutu aştı");
        const size = BigInt(buffer.byteLength);
        const mimeType = mime.lookup(name) || "application/octet-stream";

        await assertFilePolicy(name, size);
        await assertQuota(user, size);

        const existing = await prisma.file.findFirst({
          where: { folderId: parentId, name, deletedAt: null, ...(parentId === null ? { ownerId: user.id } : {}) },
        });
        if (existing) {
          if (!(await canAccessFile(user, existing.id, "EDIT"))) throw new Error("Aynı adlı dosyayı değiştirme izniniz yok");
          await saveNewFileVersion(existing, buffer, user.id, { mimeType });
        } else {
          const searchText = await extractSearchText(buffer, mimeType);
          await createFileFromBuffer({ name, mimeType, folderId: parentId, ownerId: user.id, buffer, searchText });
        }
        filesCreated++;
      } catch (e) {
        skipped++;
        errors.push(`${fullPath}: ${e instanceof Error ? e.message : "bilinmeyen hata"}`);
      }
    }

    await notifyIfQuotaWarning(user.id);
    await logAudit({
      userId: user.id,
      action: "UPLOAD",
      targetType: "folder",
      targetId: rootFolderId ?? undefined,
      detail: `${zipFileRaw.name}: ${filesCreated} dosya, ${foldersCreated} klasör çıkarıldı${skipped ? `, ${skipped} atlandı` : ""}`,
    });

    return NextResponse.json({
      filesCreated,
      foldersCreated,
      skipped,
      errors: errors.slice(0, 10),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
