import { prisma } from "@/lib/prisma";

const WARNING_THRESHOLD = 0.9; // kullanımın %90'ı

/**
 * Kullanıcının depolama kullanımı kotasının %90'ını geçtiyse bir bildirim
 * oluşturur — ama spam etmemek için, o gün içinde zaten bir kota uyarısı
 * gönderilmişse tekrar göndermez. Her "usedBytes artışı" noktasından (dosya
 * yükleme, versiyon ekleme, dönüştürme) sonra çağrılmalı.
 */
export async function notifyIfQuotaWarning(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.quotaBytes === 0n) return;

  const ratio = Number(user.usedBytes) / Number(user.quotaBytes);
  if (ratio < WARNING_THRESHOLD) return;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const alreadyWarnedToday = await prisma.notification.findFirst({
    where: { userId, type: "QUOTA_WARNING", createdAt: { gte: todayStart } },
  });
  if (alreadyWarnedToday) return;

  const percent = Math.round(ratio * 100);
  await prisma.notification.create({
    data: {
      userId,
      type: "QUOTA_WARNING",
      message: `Depolama kotanın %${percent}'ini kullandın. Yer açmak için çöp kutusunu boşaltabilir veya yöneticinden ek kota isteyebilirsin.`,
    },
  });
}
