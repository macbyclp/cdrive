import { prisma } from "@/lib/prisma";
import { deleteFile } from "@/lib/storage";
import { assertQuota } from "@/lib/access";
import { lockUser, adjustUsedBytes, versionBytesByOwner, type Db } from "@/lib/quota";

// Çok sayıda kayıt içeren ağaçlar için interaktif transaction zaman aşımı payı.
const TX_OPTS = { timeout: 60_000, maxWait: 10_000 } as const;

/** Bir klasör ağacının id'lerini seviye seviye (BFS) toplar. `childFilter` hangi alt klasörlere inileceğini belirler. */
async function collectLevels(tx: Db, rootId: string, childFilter: object): Promise<string[][]> {
  const levels: string[][] = [[rootId]];
  let frontier = [rootId];
  while (frontier.length) {
    const kids = await tx.folder.findMany({
      where: { parentId: { in: frontier }, ...childFilter },
      select: { id: true },
    });
    frontier = kids.map((k) => k.id);
    if (frontier.length) levels.push(frontier);
  }
  return levels;
}

/**
 * Bir klasörü ve altındaki tüm dosya/alt klasörleri "çöp kutusuna" taşır (soft-delete); dosya sahiplerinin
 * kullanılan kotasını (tüm sürümler dahil) serbest bırakır. Tek transaction: yarım kalmaz.
 */
export async function softDeleteFolderRecursive(folderId: string) {
  await prisma.$transaction(async (tx) => {
    const now = new Date();
    const ids = (await collectLevels(tx, folderId, { deletedAt: null })).flat();
    const files = await tx.file.findMany({
      where: { folderId: { in: ids }, deletedAt: null },
      select: { id: true, ownerId: true },
    });
    const freed = await versionBytesByOwner(tx, files);
    for (const [ownerId, bytes] of freed) {
      await lockUser(tx, ownerId);
      await adjustUsedBytes(tx, ownerId, -bytes);
    }
    await tx.file.updateMany({ where: { id: { in: files.map((f) => f.id) } }, data: { deletedAt: now } });
    await tx.folder.updateMany({ where: { id: { in: ids } }, data: { deletedAt: now } });
  }, TX_OPTS);
}

/**
 * Çöp kutusundaki bir klasörü ve içeriğini geri getirir; kotayı yeniden kullanıma alır.
 * Kota aşılacaksa (kullanıcı veya departman) HİÇBİR şey geri yüklenmez — tek transaction, kısmi geri yükleme yok.
 */
export async function restoreFolderRecursive(folderId: string) {
  await prisma.$transaction(async (tx) => {
    const folder = await tx.folder.findUnique({ where: { id: folderId } });
    if (!folder) return;
    const ids = (await collectLevels(tx, folderId, { deletedAt: { not: null } })).flat();
    const files = await tx.file.findMany({
      where: { folderId: { in: ids }, deletedAt: { not: null } },
      select: { id: true, ownerId: true },
    });
    const needed = await versionBytesByOwner(tx, files);
    for (const [ownerId, bytes] of needed) {
      await lockUser(tx, ownerId);
      const owner = await tx.user.findUniqueOrThrow({ where: { id: ownerId } });
      await assertQuota(owner, bytes, tx); // geri yüklemek kotayı yeniden tüketir
      await adjustUsedBytes(tx, ownerId, bytes);
    }
    await tx.file.updateMany({ where: { id: { in: files.map((f) => f.id) } }, data: { deletedAt: null } });
    await tx.folder.updateMany({ where: { id: { in: ids } }, data: { deletedAt: null } });
  }, TX_OPTS);
}

/**
 * Dosyaları ve tüm sürümlerini kalıcı siler. Sıra: önce veritabanı (transaction), commit'ten SONRA disk.
 * Disk silme başarısız olursa geride yetim dosya kalır (yalnızca yer kaplar; `scripts/yetim-dosya-raporu.mjs`
 * ile raporlanır) — tersi (DB'de var, diskte yok) veri kaybı olurdu.
 */
async function purgeFiles(fileIds: string[]) {
  if (fileIds.length === 0) return;
  const keys = await prisma.$transaction(async (tx) => {
    const files = await tx.file.findMany({
      where: { id: { in: fileIds } },
      select: { id: true, ownerId: true, deletedAt: true },
    });
    const versions = await tx.fileVersion.findMany({ where: { fileId: { in: fileIds } }, select: { storageKey: true } });
    // Çöp kutusunda olmayan (kotası hâlâ düşülmemiş) dosyalar için kotayı şimdi serbest bırak.
    const live = files.filter((f) => !f.deletedAt);
    const freed = await versionBytesByOwner(tx, live);
    for (const [ownerId, bytes] of freed) {
      await lockUser(tx, ownerId);
      await adjustUsedBytes(tx, ownerId, -bytes);
    }
    await tx.file.deleteMany({ where: { id: { in: files.map((f) => f.id) } } });
    return versions.map((v) => v.storageKey);
  }, TX_OPTS);
  for (const key of keys) await deleteFile(key).catch(() => {});
}

/** Bir dosyayı ve tüm versiyonlarını diskten ve veritabanından kalıcı olarak siler. */
export async function purgeFile(fileId: string) {
  await purgeFiles([fileId]);
}

/** Bir klasörü ve tüm alt ağacını (dosyalar dahil) kalıcı olarak siler. */
export async function purgeFolderRecursive(folderId: string) {
  const fileIds: string[] = [];
  const levels = await prisma.$transaction(async (tx) => {
    const lv = await collectLevels(tx, folderId, {});
    const files = await tx.file.findMany({ where: { folderId: { in: lv.flat() } }, select: { id: true } });
    fileIds.push(...files.map((f) => f.id));
    return lv;
  }, TX_OPTS);
  await purgeFiles(fileIds);
  // Klasörleri en derinden başlayarak sil (parentId yabancı anahtarı).
  await prisma.$transaction(async (tx) => {
    for (const level of [...levels].reverse()) {
      await tx.folder.deleteMany({ where: { id: { in: level } } });
    }
  }, TX_OPTS);
}
