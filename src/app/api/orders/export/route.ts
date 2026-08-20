import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canAccessOrders, canManageOrders, canManageProduction } from "@/lib/access";
import { formatDate } from "@/lib/format";
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
      const total = o.items.reduce((sum, i) => sum + i.quantity * Number(i.unitPrice), 0);
      const collected = o.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      ws.addRow({
        customer: o.customerName,
        contact: o.customerContact ?? "",
        total,
        collected,
        remaining: Math.max(0, total - collected),
        status: STATUS_LABEL[o.status] ?? o.status,
        createdBy: o.createdBy.name,
        createdAt: formatDate(o.createdAt.toISOString()),
        dueDate: o.dueDate ? formatDate(o.dueDate.toISOString()) : "",
      });
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
