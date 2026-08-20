import { prisma } from "@/lib/prisma";
import type { User, Permission } from "@prisma/client";

const rank: Record<Permission, number> = { VIEW: 1, EDIT: 2 };

function sufficient(have: Permission, need: Permission) {
  return rank[have] >= rank[need];
}

/** Bir klasör (ve üstündeki tüm ataları) üzerinde kullanıcının izin seviyesini döner, yoksa null. */
export async function folderPermissionLevel(
  user: User,
  folderId: string | null
): Promise<Permission | null> {
  if (!folderId) return "EDIT"; // kök seviyesi: herkes kendi kökünde çalışabilir
  if (user.role === "ADMIN") return "EDIT";

  let current = await prisma.folder.findUnique({ where: { id: folderId } });
  let best: Permission | null = null;

  while (current) {
    if (current.ownerId === user.id) return "EDIT";
    if (
      user.role === "MANAGER" &&
      current.departmentId &&
      current.departmentId === user.departmentId
    ) {
      return "EDIT";
    }
    const grant = await prisma.folderPermission.findUnique({
      where: { folderId_userId: { folderId: current.id, userId: user.id } },
    });
    if (grant && (!best || sufficient(grant.permission, best))) {
      best = grant.permission;
    }
    if (!current.parentId) break;
    current = await prisma.folder.findUnique({ where: { id: current.parentId } });
  }
  return best;
}

export async function canAccessFolder(user: User, folderId: string | null, need: Permission) {
  const level = await folderPermissionLevel(user, folderId);
  return level !== null && sufficient(level, need);
}

export async function filePermissionLevel(user: User, fileId: string): Promise<Permission | null> {
  if (user.role === "ADMIN") return "EDIT";

  const file = await prisma.file.findUnique({ where: { id: fileId } });
  if (!file) return null;
  if (file.ownerId === user.id) return "EDIT";

  const direct = await prisma.filePermission.findUnique({
    where: { fileId_userId: { fileId, userId: user.id } },
  });

  // ÖNEMLİ: folderPermissionLevel(user, null) kasıtlı olarak "EDIT" döner ama bu
  // sadece "kullanıcı kendi KÖKÜNDE yeni bir şey oluşturabilir mi" sorusu içindir.
  // file.folderId null ise dosya birinin kökündedir — ama HANGİ kullanıcının
  // olduğu burada bilinmiyor; o kısayolu burada çağırmak sahiplik/paylaşım fark
  // etmeksizin herkese EDIT verirdi (gerçek bir IDOR açığıydı, testlerle bulundu
  // ve düzeltildi — bkz. 2026-08-16 günlüğü).
  const folderLevel = file.folderId ? await folderPermissionLevel(user, file.folderId) : null;

  const levels = [direct?.permission, folderLevel].filter(Boolean) as Permission[];
  if (levels.length === 0) return null;
  return levels.includes("EDIT") ? "EDIT" : "VIEW";
}

export async function canAccessFile(user: User, fileId: string, need: Permission) {
  const level = await filePermissionLevel(user, fileId);
  return level !== null && sufficient(level, need);
}

export async function assertQuota(user: User, addBytes: bigint) {
  const projected = user.usedBytes + addBytes;
  if (projected > user.quotaBytes) {
    const err = new Error(
      `Depolama kotası aşıldı: ${formatBytes(user.usedBytes)} / ${formatBytes(user.quotaBytes)} kullanımda.`
    );
    (err as Error & { status?: number }).status = 413;
    throw err;
  }
}

/** Sipariş sistemine hiç erişimi olmayanlar için: sidebar'da bile görünmemeli. */
export function canAccessOrders(user: User) {
  return user.role === "ADMIN" || user.canCreateOrders || user.canManageOrders || user.canManageProduction;
}

/** Yeni sipariş oluşturabilir mi — pazarlama tarafı (+ admin). */
export function canCreateOrder(user: User) {
  return user.role === "ADMIN" || user.canCreateOrders;
}

/** Tüm siparişleri görüp durumunu değiştirebilir mi — muhasebe tarafı (+ admin). */
export function canManageOrders(user: User) {
  return user.role === "ADMIN" || user.canManageOrders;
}

/** Sipariş kalemlerinin stok durumunu (Var/Yok) işaretleyip "Üretimde" aşamasını yönetebilir mi (+ admin). */
export function canManageProduction(user: User) {
  return user.role === "ADMIN" || user.canManageProduction;
}

export function formatBytes(bytes: bigint | number) {
  const n = typeof bytes === "bigint" ? Number(bytes) : bytes;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let val = n;
  let i = 0;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(val < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}
