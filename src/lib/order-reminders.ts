import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { notifyUser } from "@/lib/notify";
import { orderRemaining } from "@/lib/orders";

/**
 * Vadesi geçmiş ve bakiyesi hâlâ kapanmamış siparişler için muhasebeye (+ admin)
 * günde en fazla bir kez hatırlatma bildirimi gönderir. İptal edilmiş siparişler
 * hariç tutulur; "kapanmış" olmak status'ten değil gerçek tahsilat toplamından
 * (items toplamı - payments toplamı) hesaplanır.
 */
export async function notifyOverdueOrders(): Promise<number> {
  const overdue = await prisma.order.findMany({
    where: { dueDate: { lt: new Date() }, status: { not: "CANCELLED" } },
    include: { items: true, payments: true },
  });

  const stillOwing = overdue.filter((o) => orderRemaining(o.items, o.payments) > 0);
  if (stillOwing.length === 0) return 0;

  const managers = await prisma.user.findMany({
    where: { active: true, OR: [{ canManageOrders: true }, { role: "ADMIN" }] },
    select: { id: true },
  });
  if (managers.length === 0) return 0;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  let notified = 0;
  for (const order of stillOwing) {
    for (const m of managers) {
      const already = await prisma.notification.findFirst({
        where: { userId: m.id, type: "ORDER_OVERDUE", targetType: "order", targetId: order.id, createdAt: { gte: todayStart } },
      });
      if (already) continue;
      await notifyUser({
        userId: m.id,
        type: "ORDER_OVERDUE",
        message: `"${order.customerName}" siparişinin vadesi (${formatDate(order.dueDate!.toISOString())}) geçti, bakiye kapanmadı`,
        targetType: "order",
        targetId: order.id,
      });
      notified++;
    }
  }
  return notified;
}
