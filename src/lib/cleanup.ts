import { prisma } from "@/lib/prisma";
import { deleteFile } from "@/lib/storage";
import { purgeFolderRecursive, purgeFile } from "@/lib/trash";
import { notifyOverdueOrders } from "@/lib/order-reminders";

export type CleanupResult = {
  purgedFolders: number;
  purgedFiles: number;
  purgedVersions: number;
  overdueOrdersNotified: number;
};

/**
 * Admin panelinden ayarlanan saklama politikasını uygular:
 * - çöp kutusundaki N günden eski öğeleri kalıcı siler,
 * - "current" olmayan (yani artık kimsenin görmediği) N günden eski dosya
 *   versiyonlarını diskten ve veritabanından siler.
 * Harici bir zamanlayıcı (cPanel Cron Job) veya admin panelinden elle
 * tetiklenmek üzere tasarlandı — kendi kendine zamanlanmıyor.
 */
export async function runCleanup(): Promise<CleanupResult> {
  const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });
  const result: CleanupResult = { purgedFolders: 0, purgedFiles: 0, purgedVersions: 0, overdueOrdersNotified: 0 };

  if (settings?.trashRetentionDays) {
    const cutoff = new Date(Date.now() - settings.trashRetentionDays * 86_400_000);

    // Sadece "silmenin başladığı" üst düzey klasörleri hedefle — alt klasörler
    // zaten purgeFolderRecursive tarafından rekürsif olarak temizleniyor,
    // onları ayrıca sorgulamak (parent'ı az önce silinmiş) hataya yol açar.
    const rootDeletedFolders = await prisma.folder.findMany({
      where: {
        deletedAt: { lt: cutoff },
        OR: [{ parentId: null }, { parent: { deletedAt: null } }],
      },
      select: { id: true },
    });
    for (const f of rootDeletedFolders) {
      await purgeFolderRecursive(f.id);
      result.purgedFolders++;
    }

    // Aynı mantık: sadece doğrudan (bir klasör silme işleminin parçası
    // olmadan) silinmiş dosyalar.
    const rootDeletedFiles = await prisma.file.findMany({
      where: {
        deletedAt: { lt: cutoff },
        OR: [{ folderId: null }, { folder: { deletedAt: null } }],
      },
      select: { id: true },
    });
    for (const f of rootDeletedFiles) {
      await purgeFile(f.id);
      result.purgedFiles++;
    }
  }

  if (settings?.versionRetentionDays) {
    const cutoff = new Date(Date.now() - settings.versionRetentionDays * 86_400_000);
    const oldVersions = await prisma.fileVersion.findMany({
      where: { createdAt: { lt: cutoff }, currentFor: null },
      select: { id: true, storageKey: true },
    });
    for (const v of oldVersions) {
      await deleteFile(v.storageKey);
      await prisma.fileVersion.delete({ where: { id: v.id } });
      result.purgedVersions++;
    }
  }

  result.overdueOrdersNotified = await notifyOverdueOrders();

  return result;
}
