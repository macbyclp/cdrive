import { prisma } from "@/lib/prisma";
import { writeFile, readFile, deleteFile } from "@/lib/storage";
import { extractSearchText } from "@/lib/text-extract";
import { logAudit } from "@/lib/audit";
import { notifyIfQuotaWarning } from "@/lib/quota-notify";
import { assertQuota } from "@/lib/access";
import { lockUser, adjustUsedBytes } from "@/lib/quota";
import type { File as PrismaFile } from "@prisma/client";

/**
 * Diske yazma + veritabanı işlemi sırası (tüm yükleme akışları için ortak kural):
 *  1. içerik önce diske yazılır (rastgele storageKey),
 *  2. tüm DB yazımları TEK `$transaction` içinde yapılır (kullanıcı satırı kilitli, kota kontrolü kilit altında),
 *  3. transaction başarısız olursa diske yazılan dosya silinir (yetim dosya kalmaz).
 * Ters sıra (önce DB) tercih edilmedi: DB'de var olup diskte olmayan dosya, diskte fazladan duran
 * dosyadan çok daha kötüdür (kullanıcı veri kaybı görür).
 */

export type NewFileInput = {
  name: string;
  mimeType: string;
  folderId: string | null;
  ownerId: string;
  uploaderId?: string;
  buffer: Buffer;
  searchText?: string | null;
};

/** Yeni dosya + v1 sürümü + kota güncellemesi; atomik. */
export async function createFileFromBuffer(input: NewFileInput) {
  const storageKey = await writeFile(input.buffer);
  const { buffer, ...rest } = input;
  return createFileFromStored({ ...rest, storageKey, size: BigInt(buffer.byteLength) });
}

/**
 * Zaten diske yazılmış (akışla yüklenmiş) içerik için `createFileFromBuffer`. `storageKey` ÇAĞIRAN
 * tarafından yazılmıştır; bu fonksiyon çağrıldıktan sonra sahiplik burada: transaction başarısız olursa
 * dosya silinir. (Çağrıdan ÖNCE hata olursa silmek çağıranın işidir.)
 */
export async function createFileFromStored(input: Omit<NewFileInput, "buffer"> & { storageKey: string; size: bigint }) {
  const { storageKey, size } = input;
  try {
    return await prisma.$transaction(async (tx) => {
      await lockUser(tx, input.ownerId);
      const owner = await tx.user.findUniqueOrThrow({ where: { id: input.ownerId } });
      await assertQuota(owner, size, tx);
      const created = await tx.file.create({
        data: {
          name: input.name,
          mimeType: input.mimeType,
          size,
          folderId: input.folderId,
          ownerId: input.ownerId,
          searchText: input.searchText ?? null,
        },
      });
      const version = await tx.fileVersion.create({
        data: { fileId: created.id, versionNo: 1, storageKey, size, uploadedById: input.uploaderId ?? input.ownerId },
      });
      const file = await tx.file.update({ where: { id: created.id }, data: { currentVersionId: version.id } });
      await adjustUsedBytes(tx, input.ownerId, size);
      return file;
    });
  } catch (e) {
    await deleteFile(storageKey).catch(() => {});
    throw e;
  }
}

// Arama metni için diskten belleğe okunacak en büyük dosya (daha büyükler yalnız ada göre aranır).
const SEARCH_TEXT_MAX_BYTES = 25 * 1024 * 1024;

/** Diskteki içerikten arama metni çıkarır; yalnız küçük metin/PDF dosyaları belleğe alınır. */
export async function searchTextForStored(storageKey: string, mimeType: string, size: bigint): Promise<string | null> {
  const searchable = mimeType.startsWith("text/") || mimeType === "application/json" || mimeType === "application/pdf";
  if (!searchable || size > BigInt(SEARCH_TEXT_MAX_BYTES)) return null;
  return extractSearchText(await readFile(storageKey), mimeType);
}

/**
 * Var olan bir dosyaya yeni bir versiyon ekler (diske yazar, FileVersion oluşturur,
 * currentVersionId + kota muhasebesini günceller). `POST /api/files` (yeniden
 * yükleme ile versiyonlama), zip-upload ve OnlyOffice kaydetme callback'i tarafından ortak
 * kullanılır. Yeni sürümün TAM boyutu sahibin kotasına eklenir (eski sürümler de sayıldığı için).
 */
export async function saveNewFileVersion(
  existing: PrismaFile,
  buffer: Buffer,
  uploaderId: string,
  opts?: { mimeType?: string; auditDetailPrefix?: string }
) {
  const searchText = await extractSearchText(buffer, opts?.mimeType || existing.mimeType);
  const storageKey = await writeFile(buffer);
  return saveNewFileVersionFromStored(existing, { storageKey, size: BigInt(buffer.byteLength), searchText }, uploaderId, opts);
}

/** `saveNewFileVersion`'ın, içeriği zaten diske yazılmış (akışla yüklenmiş) hali; sahiplik/silme kuralı `createFileFromStored` ile aynı. */
export async function saveNewFileVersionFromStored(
  existing: PrismaFile,
  stored: { storageKey: string; size: bigint; searchText: string | null },
  uploaderId: string,
  opts?: { mimeType?: string; auditDetailPrefix?: string }
) {
  const { storageKey, size, searchText } = stored;

  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      await lockUser(tx, existing.ownerId);
      const current = await tx.file.findUnique({ where: { id: existing.id } });
      if (!current || current.deletedAt) {
        const err = new Error("Dosya bulunamadı veya çöp kutusunda");
        (err as Error & { status?: number }).status = 404;
        throw err;
      }
      const owner = await tx.user.findUniqueOrThrow({ where: { id: current.ownerId } });
      await assertQuota(owner, size, tx);

      const lastVersion = await tx.fileVersion.findFirst({
        where: { fileId: existing.id },
        orderBy: { versionNo: "desc" },
      });
      const versionNo = (lastVersion?.versionNo ?? 0) + 1;
      const version = await tx.fileVersion.create({
        data: { fileId: existing.id, versionNo, storageKey, size, uploadedById: uploaderId },
      });
      const updated = await tx.file.update({
        where: { id: existing.id },
        data: {
          size,
          mimeType: opts?.mimeType || existing.mimeType,
          currentVersionId: version.id,
          searchText,
        },
      });
      await adjustUsedBytes(tx, current.ownerId, size);
      return { file: updated, version, versionNo };
    });
  } catch (e) {
    await deleteFile(storageKey).catch(() => {});
    throw e;
  }

  await notifyIfQuotaWarning(existing.ownerId);
  await logAudit({
    userId: uploaderId,
    action: "UPLOAD",
    targetType: "file",
    targetId: existing.id,
    detail: `${opts?.auditDetailPrefix ?? ""}v${result.versionNo}: ${existing.name}`,
  });

  return { file: result.file, version: result.version };
}
