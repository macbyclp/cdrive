import { prisma } from "@/lib/prisma";
import { deleteFile } from "@/lib/storage";

/** Bir klasörü ve altındaki tüm dosya/alt klasörleri "çöp kutusuna" taşır (soft-delete); dosya sahiplerinin kullanılan kotasını serbest bırakır. */
export async function softDeleteFolderRecursive(folderId: string) {
  const now = new Date();
  const files = await prisma.file.findMany({ where: { folderId, deletedAt: null } });
  for (const f of files) {
    await prisma.file.update({ where: { id: f.id }, data: { deletedAt: now } });
    await prisma.user.update({ where: { id: f.ownerId }, data: { usedBytes: { decrement: f.size } } });
  }
  await prisma.folder.update({ where: { id: folderId }, data: { deletedAt: now } });
  const children = await prisma.folder.findMany({ where: { parentId: folderId, deletedAt: null }, select: { id: true } });
  for (const c of children) await softDeleteFolderRecursive(c.id);
}

/** Çöp kutusundaki bir klasörü ve içeriğini geri getirir; kotayı yeniden kullanıma alır. */
export async function restoreFolderRecursive(folderId: string) {
  const folder = await prisma.folder.findUnique({ where: { id: folderId } });
  if (!folder) return;
  await prisma.folder.update({ where: { id: folderId }, data: { deletedAt: null } });
  const files = await prisma.file.findMany({ where: { folderId, deletedAt: { not: null } } });
  for (const f of files) {
    await prisma.file.update({ where: { id: f.id }, data: { deletedAt: null } });
    await prisma.user.update({ where: { id: f.ownerId }, data: { usedBytes: { increment: f.size } } });
  }
  const children = await prisma.folder.findMany({
    where: { parentId: folderId, deletedAt: { not: null } },
    select: { id: true },
  });
  for (const c of children) await restoreFolderRecursive(c.id);
}

/** Bir dosyayı ve tüm versiyonlarını diskten ve veritabanından kalıcı olarak siler. */
export async function purgeFile(fileId: string) {
  const versions = await prisma.fileVersion.findMany({ where: { fileId } });
  for (const v of versions) await deleteFile(v.storageKey);
  await prisma.file.delete({ where: { id: fileId } });
}

/** Bir klasörü ve tüm alt ağacını (dosyalar dahil) kalıcı olarak siler. */
export async function purgeFolderRecursive(folderId: string) {
  const children = await prisma.folder.findMany({ where: { parentId: folderId }, select: { id: true } });
  for (const c of children) await purgeFolderRecursive(c.id);
  const files = await prisma.file.findMany({ where: { folderId }, select: { id: true } });
  for (const f of files) await purgeFile(f.id);
  await prisma.folder.delete({ where: { id: folderId } });
}
