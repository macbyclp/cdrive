import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canAccessOrders, canManageOrders, canManageProduction } from "@/lib/access";
import { formatDate } from "@/lib/format";
import { orderTotal, orderCollected, remainingFrom } from "@/lib/orders";
import { errorResponse } from "@/lib/api-helpers";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Beklemede",
  APPROVED: "Onaylandı",
  IN_PRODUCTION: "Üretimde",
  INVOICED: "Faturalandı",
  CANCELLED: "İptal",
};

/** Sipariş listesini (mevcut filtrelerle) Excel'e döker — aynı görünürlük kuralı GET /api/orders ile aynı. */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    if (!canAccessOrders(user)) return NextResponse.json({ error: "Bu bölüme erişiminiz yok" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const q = searchParams.get("q")?.trim();
    const mine = searchParams.get("mine") === "1";
    const statusFilter = status && status !== "ALL" ? { status: status as "PENDING" | "APPROVED" | "IN_PRODUCTION" | "INVOICED" | "CANCELLED" } : {};
    const qFilter = q ? { customerName: { contains: q } } : {};

    const scoped = mine || (!canManageOrders(user) && !canManageProduction(user));
    const orders = await prisma.order.findMany({
      where: { ...statusFilter, ...qFilter, ...(scoped ? { createdById: user.id } : {}) },
      orderBy: { createdAt: "desc" },
      include: { createdBy: { select: { name: true } }, items: true, payments: true },
    });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Siparişler");
    ws.columns = [
      { header: "Müşteri", key: "customer", width: 28 },
      { header: "İletişim", key: "contact", width: 20 },
      { header: "Tutar (₺)", key: "total", width: 14 },
      { header: "Tahsil edilen (₺)", key: "collected", width: 16 },
      { header: "Kalan (₺)", key: "remaining", width: 14 },
      { header: "Durum", key: "status", width: 14 },
      { header: "Oluşturan", key: "createdBy", width: 20 },
      { header: "Tarih", key: "createdAt", width: 20 },
      { header: "Vade tarihi", key: "dueDate", width: 20 },
    ];
    ws.getRow(1).font = { bold: true };

    for (const o of orders) {
      const total = orderTotal(o.items);
      const collected = orderCollected(o.payments);
      ws.addRow({
        customer: o.customerName,
        contact: o.customerContact ?? "",
        total,
        collected,
        remaining: remainingFrom(total, collected),
        status: STATUS_LABEL[o.status] ?? o.status,
        createdBy: o.createdBy.name,
        createdAt: formatDate(o.createdAt.toISOString()),
        dueDate: o.dueDate ? formatDate(o.dueDate.toISOString()) : "",
      });
    }

    // "Siparişler" sekmesindeki AYNI (görünürlük kapsamı zaten uygulanmış) veriden iki ek
    // özet sekmesi türetiliyor — ayrı bir sorgu/endpoint değil, aynı `orders` dizisi üzerinden.
    const monthlyMap = new Map<string, { count: number; total: number; collected: number }>();
    const customerMap = new Map<string, { count: number; total: number; collected: number }>();
    for (const o of orders) {
      const total = orderTotal(o.items);
      const collected = orderCollected(o.payments);

      const monthKey = `${o.createdAt.getFullYear()}-${String(o.createdAt.getMonth() + 1).padStart(2, "0")}`;
      const m = monthlyMap.get(monthKey) ?? { count: 0, total: 0, collected: 0 };
      m.count++;
      m.total += total;
      m.collected += collected;
      monthlyMap.set(monthKey, m);

      const c = customerMap.get(o.customerName) ?? { count: 0, total: 0, collected: 0 };
      c.count++;
      c.total += total;
      c.collected += collected;
      customerMap.set(o.customerName, c);
    }

    const wsMonthly = wb.addWorksheet("Aylık Özet");
    wsMonthly.columns = [
      { header: "Ay", key: "month", width: 12 },
      { header: "Sipariş sayısı", key: "count", width: 16 },
      { header: "Toplam ciro (₺)", key: "total", width: 18 },
      { header: "Tahsil edilen (₺)", key: "collected", width: 18 },
      { header: "Kalan (₺)", key: "remaining", width: 14 },
    ];
    wsMonthly.getRow(1).font = { bold: true };
    for (const [month, v] of [...monthlyMap.entries()].sort((a, b) => b[0].localeCompare(a[0]))) {
      wsMonthly.addRow({ month, count: v.count, total: v.total, collected: v.collected, remaining: Math.max(0, v.total - v.collected) });
    }

    const wsCustomer = wb.addWorksheet("Müşteri Özeti");
    wsCustomer.columns = [
      { header: "Müşteri", key: "customer", width: 28 },
      { header: "Sipariş sayısı", key: "count", width: 16 },
      { header: "Toplam ciro (₺)", key: "total", width: 18 },
      { header: "Tahsil edilen (₺)", key: "collected", width: 18 },
      { header: "Kalan (₺)", key: "remaining", width: 14 },
    ];
    wsCustomer.getRow(1).font = { bold: true };
    for (const [customer, v] of [...customerMap.entries()].sort((a, b) => b[1].total - a[1].total)) {
      wsCustomer.addRow({ customer, count: v.count, total: v.total, collected: v.collected, remaining: Math.max(0, v.total - v.collected) });
    }

    const buffer = await wb.xlsx.writeBuffer();
    return new NextResponse(new Uint8Array(Buffer.from(buffer)), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="siparisler.xlsx"`,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
