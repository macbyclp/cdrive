// Süresi dolmak üzere olan paylaşım bağlantıları ve dosya istekleri için sahibine TEK SEFERLİK uyarı.
// Süre dolunca bağlantı sessizce çalışmayı bırakıyordu; dışarıdaki biri hâlâ bekliyorsa sahibi fark etmiyordu.
// Harici zamanlayıcının çağırdığı runCleanup içinden çalışır (bkz. lib/cleanup.ts).
import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notify";

export const EXPIRY_WARN_HOURS = 48;

/**
 * Bağlantının TOPLAM ömrü uyarı penceresinden kısaysa (ör. 1 saatlik) uyarı anlamsızdır — sahibi süreyi
 * zaten az önce kendisi seçti. Yalnız pencereden uzun ömürlü bağlantılar uyarılır.
 */
export function wantsExpiryWarning(createdAt: Date, expiresAt: Date, warnHours = EXPIRY_WARN_HOURS): boolean {
  return expiresAt.getTime() - createdAt.getTime() > warnHours * 3600_000;
}

function hoursLeft(expiresAt: Date, now: Date) {
  return Math.max(1, Math.round((expiresAt.getTime() - now.getTime()) / 3600_000));
}

/** Uyarılan bağlantı sayısını döner. Her bağlantı için `expiryNotifiedAt` atomik alınır (çift bildirim yok). */
export async function notifyExpiringLinks(now: Date = new Date(), warnHours = EXPIRY_WARN_HOURS): Promise<number> {
  const horizon = new Date(now.getTime() + warnHours * 3600_000);
  let sent = 0;

  const shares = await prisma.shareLink.findMany({
    where: { revoked: false, expiryNotifiedAt: null, expiresAt: { gt: now, lte: horizon }, file: { deletedAt: null } },
    include: { file: { select: { name: true, folderId: true } } },
    take: 500,
  });
  for (const l of shares) {
    if (!l.expiresAt || !wantsExpiryWarning(l.createdAt, l.expiresAt, warnHours)) continue;
    const claimed = await prisma.shareLink.updateMany({ where: { id: l.id, expiryNotifiedAt: null }, data: { expiryNotifiedAt: now } });
    if (claimed.count !== 1) continue;
    await notifyUser({
      userId: l.createdById,
      type: "LINK_EXPIRING",
      message: `"${l.file.name}" için oluşturduğunuz paylaşım bağlantısının süresi yaklaşık ${hoursLeft(l.expiresAt, now)} saat sonra doluyor`,
      targetType: l.file.folderId ? "folder" : undefined,
      targetId: l.file.folderId,
    }).catch(() => {});
    sent++;
  }

  const requests = await prisma.uploadRequest.findMany({
    where: { revoked: false, expiryNotifiedAt: null, expiresAt: { gt: now, lte: horizon } },
    take: 500,
  });
  for (const r of requests) {
    if (!wantsExpiryWarning(r.createdAt, r.expiresAt, warnHours) || r.uploadCount >= r.maxFiles) continue;
    const claimed = await prisma.uploadRequest.updateMany({ where: { id: r.id, expiryNotifiedAt: null }, data: { expiryNotifiedAt: now } });
    if (claimed.count !== 1) continue;
    await notifyUser({
      userId: r.createdById,
      type: "LINK_EXPIRING",
      message: `"${r.title}" dosya isteğinin süresi yaklaşık ${hoursLeft(r.expiresAt, now)} saat sonra doluyor (${r.uploadCount}/${r.maxFiles} dosya alındı)`,
      targetType: "folder",
      targetId: r.folderId,
    }).catch(() => {});
    sent++;
  }
  return sent;
}
