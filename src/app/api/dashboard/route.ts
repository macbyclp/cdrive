import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canManageOrders } from "@/lib/access";
import { errorResponse } from "@/lib/api-helpers";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Beklemede",
  APPROVED: "Onaylandı",
  INVOICED: "Faturalandı",
  CANCELLED: "İptal",
};

// Zaman çizelgesindeki adım sırası — progress bar yüzdesi buradaki konuma göre hesaplanır.
const STATUS_STEPS = ["PENDING", "APPROVED", "INVOICED"];

function orderTotal(items: { quantity: number; unitPrice: unknown }[]) {
  return items.reduce((sum, i) => sum + i.quantity * Number(i.unitPrice), 0);
}
function orderCollected(payments: { amount: unknown }[]) {
  return payments.reduce((sum, p) => sum + Number(p.amount), 0);
}

/**
 * /panel gösterge panelinin tek toplama noktası — hepsi gerçek, hesaplanmış veri:
 * uydurma "ciro" ya da rastgele yüzdeler yok. /panel artık herkesin ana ekranı (sadece
 * sipariş yetkisi olanların değil), o yüzden burada 403 YOK — sipariş sistemine hiç
 * erişimi olmayan bir kullanıcı (canCreateOrders/canManageOrders/ADMIN'in hiçbiri değil)
 * "kendi oluşturduğu siparişler" filtresiyle sorgulanır, bu doğal olarak boş/sıfır
 * gelir ve panel yine de boş durumlarla (skeleton yerine "Henüz sipariş yok" vb.) düzgün
 * render olur. Görünürlük: muhasebe/admin tümünü, diğer herkes yalnız kendi siparişlerini
 * (varsa) görür.
 */
export async function GET() {
  try {
    const user = await requireUser();
    const scoped = !canManageOrders(user);
    const where = scoped ? { createdById: user.id } : {};

    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const orders = await prisma.order.findMany({
      where,
      include: { items: true, payments: true, customer: true },
      orderBy: { createdAt: "desc" },
    });

    const thisMonth = orders.filter((o) => o.createdAt >= startOfThisMonth);
    const lastMonth = orders.filter((o) => o.createdAt >= startOfLastMonth && o.createdAt < startOfThisMonth);

    function trendPct(current: number, previous: number) {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    }

    const thisMonthRevenue = thisMonth
      .filter((o) => o.status !== "CANCELLED")
      .reduce((sum, o) => sum + orderTotal(o.items), 0);
    const lastMonthRevenue = lastMonth
      .filter((o) => o.status !== "CANCELLED")
      .reduce((sum, o) => sum + orderTotal(o.items), 0);

    const outstandingBalance = orders
      .filter((o) => o.status !== "CANCELLED")
      .reduce((sum, o) => sum + Math.max(0, orderTotal(o.items) - orderCollected(o.payments)), 0);

    const statusBreakdown = ["PENDING", "APPROVED", "INVOICED", "CANCELLED"].map((status) => ({
      status,
      label: STATUS_LABEL[status],
      count: orders.filter((o) => o.status === status).length,
    }));

    // En son sipariş — "Order Info" / "Package Information" kartları için.
    const latest = orders[0] ?? null;
    let recentOrder = null;
    if (latest) {
      const timeline = await prisma.auditLog.findMany({
        where: { targetType: "order", targetId: latest.id },
        orderBy: { createdAt: "asc" },
        include: { user: { select: { name: true } } },
      });
      const stepIndex = STATUS_STEPS.indexOf(latest.status);
      const progressPct =
        latest.status === "CANCELLED" ? 100 : Math.round(((stepIndex + 1) / STATUS_STEPS.length) * 100);
      recentOrder = {
        id: latest.id,
        customerName: latest.customerName,
        customerContact: latest.customerContact,
        status: latest.status,
        statusLabel: STATUS_LABEL[latest.status],
        createdAt: latest.createdAt,
        dueDate: latest.dueDate,
        total: orderTotal(latest.items),
        collected: orderCollected(latest.payments),
        itemCount: latest.items.length,
        progressPct,
        timeline: timeline.map((t) => ({
          id: t.id,
          action: t.action,
          detail: t.detail,
          createdAt: t.createdAt,
          userName: t.user?.name ?? null,
        })),
      };
    }

    // Son müşteriler — /api/customers ile aynı toplama mantığı, sadece en yeni sipariş
    // tarihine göre sıralanıp ilk 5'i alınıyor.
    const byCustomer = new Map<
      string,
      { id: string; name: string; contact: string | null; orderCount: number; revenue: number; lastOrderAt: Date }
    >();
    for (const o of orders) {
      if (!o.customer) continue;
      const entry = byCustomer.get(o.customer.id) ?? {
        id: o.customer.id,
        name: o.customer.name,
        contact: o.customer.contact,
        orderCount: 0,
        revenue: 0,
        lastOrderAt: o.createdAt,
      };
      entry.orderCount++;
      if (o.status !== "CANCELLED") entry.revenue += orderTotal(o.items);
      if (o.createdAt > entry.lastOrderAt) entry.lastOrderAt = o.createdAt;
      byCustomer.set(o.customer.id, entry);
    }
    const latestCustomers = [...byCustomer.values()]
      .sort((a, b) => b.lastOrderAt.getTime() - a.lastOrderAt.getTime())
      .slice(0, 5);

    // "Genel Görünüm" haritası için — sadece daha önce geocode edilmiş (bkz.
    // src/lib/geocode.ts, fatura ekinden adres çekilince tetiklenir) müşteriler.
    // Uydurma/varsayılan konum yok: adresi geocode edilmemiş müşteri haritada görünmez.
    const seenCustomerIds = new Set<string>();
    const mapPoints: { id: string; name: string; address: string | null; lat: number; lng: number }[] = [];
    for (const o of orders) {
      if (!o.customer || o.customer.lat === null || o.customer.lng === null) continue;
      if (seenCustomerIds.has(o.customer.id)) continue;
      seenCustomerIds.add(o.customer.id);
      mapPoints.push({
        id: o.customer.id,
        name: o.customer.name,
        address: o.customer.address,
        lat: o.customer.lat,
        lng: o.customer.lng,
      });
    }

    return NextResponse.json({
      stats: {
        thisMonthOrderCount: thisMonth.length,
        orderCountTrendPct: trendPct(thisMonth.length, lastMonth.length),
        thisMonthRevenue,
        revenueTrendPct: trendPct(thisMonthRevenue, lastMonthRevenue),
        outstandingBalance,
      },
      statusBreakdown,
      recentOrder,
      latestCustomers,
      mapPoints,
      scoped,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
