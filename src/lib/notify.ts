import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mailer";
import type { NotificationType } from "@prisma/client";

// E-posta SADECE zaman-kritik/eyleme-geçirilebilir türlerde gidiyor — her dosya paylaşımı
// veya kanaldaki her @bahsetme e-postaya dönüşürse spam olur; bunlar in-app bildirimde kalır.
const EMAIL_TYPES: readonly NotificationType[] = ["ORDER_CREATED", "ORDER_STATUS_CHANGED", "PAYMENT_RECORDED", "ORDER_OVERDUE", "CHAT_DM"];

const SUBJECT_PREFIX: Partial<Record<NotificationType, string>> = {
  ORDER_CREATED: "Yeni sipariş",
  ORDER_STATUS_CHANGED: "Sipariş durumu güncellendi",
  PAYMENT_RECORDED: "Tahsilat kaydedildi",
  ORDER_OVERDUE: "Vadesi geçen sipariş",
  CHAT_DM: "Yeni mesaj",
};

type NotifyInput = { userId: string; type: NotificationType; message: string; targetType?: string; targetId?: string | null };

/** Tek kullanıcıya bildirim — her zaman DB'ye yazar, uygun türlerde AYRICA (best-effort) e-posta gönderir. */
export async function notifyUser(data: NotifyInput) {
  const notification = await prisma.notification.create({
    data: { userId: data.userId, type: data.type, message: data.message, targetType: data.targetType, targetId: data.targetId },
  });
  if (EMAIL_TYPES.includes(data.type)) {
    const user = await prisma.user.findUnique({ where: { id: data.userId }, select: { email: true } });
    if (user) void sendMail({ to: user.email, subject: `Cdrive — ${SUBJECT_PREFIX[data.type]}`, text: data.message });
  }
  return notification;
}

/** Aynı bildirimi birden fazla kullanıcıya — tek bir createMany + gerekiyorsa toplu e-posta. */
export async function notifyUsers(userIds: string[], type: NotificationType, message: string, targetType?: string, targetId?: string | null) {
  if (userIds.length === 0) return;
  await prisma.notification.createMany({ data: userIds.map((userId) => ({ userId, type, message, targetType, targetId })) });
  if (EMAIL_TYPES.includes(type)) {
    const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { email: true } });
    for (const u of users) void sendMail({ to: u.email, subject: `Cdrive — ${SUBJECT_PREFIX[type]}`, text: message });
  }
}
