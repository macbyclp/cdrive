import { prisma } from "@/lib/prisma";
import { sendMail, appBaseUrl } from "@/lib/mailer";
import { genericNotificationEmail } from "@/lib/email-templates";
import { getOrgName } from "@/lib/org";
import type { NotificationType } from "@prisma/client";

// E-posta SADECE zaman-kritik/eyleme-geçirilebilir türlerde gidiyor — her dosya paylaşımı
// veya kanaldaki her @bahsetme e-postaya dönüşürse spam olur; bunlar in-app bildirimde kalır.
const EMAIL_TYPES: readonly NotificationType[] = ["ORDER_CREATED", "ORDER_STATUS_CHANGED", "PAYMENT_RECORDED", "ORDER_OVERDUE", "CHAT_DM"];

const HEADING: Partial<Record<NotificationType, string>> = {
  ORDER_CREATED: "Yeni sipariş",
  ORDER_STATUS_CHANGED: "Sipariş durumu güncellendi",
  PAYMENT_RECORDED: "Tahsilat kaydedildi",
  ORDER_OVERDUE: "Vadesi geçen sipariş",
  CHAT_DM: "Yeni mesaj",
};

/** DM'de targetId gönderenin id'si (bkz. ChatScreen deep-link) — diğer türlerde tek, genel bir "Cdrive'ı aç" butonu yeterli. */
function ctaFor(type: NotificationType, targetId?: string | null): { label: string; url: string } | undefined {
  if (type === "CHAT_DM" && targetId) return { label: "Mesajı gör", url: `${appBaseUrl()}/chat?dm=${targetId}` };
  if (EMAIL_TYPES.includes(type)) return { label: "Cdrive'ı aç", url: appBaseUrl() };
  return undefined;
}

async function emailFor(userId: string, type: NotificationType, message: string, orgName: string, targetId?: string | null) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) return;
  const heading = HEADING[type] ?? "Bildirim";
  const { subject, html, text } = genericNotificationEmail({ heading, message, cta: ctaFor(type, targetId), orgName });
  void sendMail({ to: user.email, subject, html, text });
}

type NotifyInput = { userId: string; type: NotificationType; message: string; targetType?: string; targetId?: string | null };

/** Tek kullanıcıya bildirim — her zaman DB'ye yazar, uygun türlerde AYRICA (best-effort) markalı HTML e-posta gönderir. */
export async function notifyUser(data: NotifyInput) {
  const notification = await prisma.notification.create({
    data: { userId: data.userId, type: data.type, message: data.message, targetType: data.targetType, targetId: data.targetId },
  });
  if (EMAIL_TYPES.includes(data.type)) {
    const orgName = await getOrgName();
    void emailFor(data.userId, data.type, data.message, orgName, data.targetId);
  }
  return notification;
}

/** Aynı bildirimi birden fazla kullanıcıya — tek bir createMany + gerekiyorsa toplu e-posta. */
export async function notifyUsers(userIds: string[], type: NotificationType, message: string, targetType?: string, targetId?: string | null) {
  if (userIds.length === 0) return;
  await prisma.notification.createMany({ data: userIds.map((userId) => ({ userId, type, message, targetType, targetId })) });
  if (EMAIL_TYPES.includes(type)) {
    const orgName = await getOrgName();
    for (const userId of userIds) void emailFor(userId, type, message, orgName, targetId);
  }
}
