import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canAccessOrders, canManageOrders } from "@/lib/access";
import { orderTotal, orderCollected } from "@/lib/orders";
import { errorResponse } from "@/lib/api-helpers";

/**
 * Müşteri listesi + toplu istatistikler (sipariş sayısı, toplam ciro, toplam tahsilat).
 * Muhasebe (canManageOrders) tüm müşterileri görür; sadece sipariş oluşturabilen (pazarlama)
 * kullanıcı yalnızca KENDİ açtığı siparişlerin müşterilerini ve o siparişlere ait rakamları
 * görür — sipariş listesindeki görünürlük kuralıyla aynı mantık.
 */
export async function GET() {
  try {
    const user = await requireUser();
    if (!canAccessOrders(user)) return NextResponse.json({ error: "Bu bölüme erişiminiz yok" }, { status: 403 });

    const orders = await prisma.order.findMany({
      where: canManageOrders(user) ? { customerId: { not: null } } : { customerId: { not: null }, createdById: user.id },
      include: { customer: true, items: true, payments: true },
    });

    const byCustomer = new Map<
      string,
      {
        id: string;
        name: string;
        contact: string | null;
        address: string | null;
        taxNumber: string | null;
        taxOffice: string | null;
        phone: string | null;
        email: string | null;
        orderCount: number;
        revenue: number;
        collected: number;
      }
    >();
    for (const o of orders) {
      if (!o.customer) continue;
      const total = orderTotal(o.items);
      const collected = orderCollected(o.payments);
      const entry = byCustomer.get(o.customer.id) ?? {
        id: o.customer.id,
        name: o.customer.name,
        contact: o.customer.contact,
        address: o.customer.address,
        taxNumber: o.customer.taxNumber,
        taxOffice: o.customer.taxOffice,
        phone: o.customer.phone,
        email: o.customer.email,
        orderCount: 0,
        revenue: 0,
        collected: 0,
      };
      entry.orderCount++;
      if (o.status !== "CANCELLED") {
        entry.revenue += total;
        entry.collected += collected;
      }
      byCustomer.set(o.customer.id, entry);
    }

    const customers = [...byCustomer.values()].sort((a, b) => b.revenue - a.revenue);
    return NextResponse.json(customers);
  } catch (err) {
    return errorResponse(err);
  }
}
