import { prisma } from "@/lib/prisma";
import { writeFile } from "@/lib/storage";
import { extractSearchText } from "@/lib/text-extract";
import { logAudit } from "@/lib/audit";
import { notifyIfQuotaWarning } from "@/lib/quota-notify";
import type { File as PrismaFile } from "@prisma/client";

/**
 * Var olan bir dosyaya yeni bir versiyon ekler (diske yazar, FileVersion oluşturur,
 * currentVersionId + kota muhasebesini günceller). `POST /api/files` (yeniden
 * yükleme ile versiyonlama) ve OnlyOffice kaydetme callback'i tarafından ortak
 * kullanılır — iki yerde de aynı mantığın tekrarlanmasını önler.
 */
export async function saveNewFileVersion(
  existing: PrismaFile,
  buffer: Buffer,
  uploaderId: string,
  opts?: { mimeType?: string; auditDetailPrefix?: string }
) {
  const size = BigInt(buffer.byteLength);
  const storageKey = await writeFile(buffer);
  const searchText = await extractSearchText(buffer, opts?.mimeType || existing.mimeType);

  const lastVersion = await prisma.fileVersion.findFirst({
    where: { fileId: existing.id },
    orderBy: { versionNo: "desc" },
  });
  const versionNo = (lastVersion?.versionNo ?? 0) + 1;
  const version = await prisma.fileVersion.create({
    data: { fileId: existing.id, versionNo, storageKey, size, uploadedById: uploaderId },
  });

  const sizeDelta = size - existing.size;
  const updated = await prisma.file.update({
    where: { id: existing.id },
    data: {
      size,
      mimeType: opts?.mimeType || existing.mimeType,
      currentVersionId: version.id,
      searchText,
    },
  });
  await prisma.user.update({
    where: { id: existing.ownerId },
    data: { usedBytes: { increment: sizeDelta > 0n ? sizeDelta : 0n } },
  });
  await notifyIfQuotaWarning(existing.ownerId);
  await logAudit({
    userId: uploaderId,
    action: "UPLOAD",
    targetType: "file",
    targetId: existing.id,
    detail: `${opts?.auditDetailPrefix ?? ""}v${versionNo}: ${existing.name}`,
  });

  return { file: updated, version };
}
