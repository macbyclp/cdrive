import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canCreateOrder, canManageOrders } from "@/lib/access";
import { formatCurrencyTL, formatDate } from "@/lib/format";
import { pdfSafe } from "@/lib/pdf-text";
import { errorResponse } from "@/lib/api-helpers";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Beklemede",
  APPROVED: "Onaylandi",
  INVOICED: "Faturalandi",
  CANCELLED: "Iptal",
};

/** Bir siparişin basit bir fatura/makbuz PDF'ini üretir — sipariş detayını görebilen herkes indirebilir. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        createdBy: { select: { name: true } },
        items: true,
        payments: { orderBy: { paidAt: "asc" } },
      },
    });
    if (!order) return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });

    const ok = canManageOrders(user) || (canCreateOrder(user) && order.createdById === user.id);
    if (!ok) return NextResponse.json({ error: "Bu siparişe erişiminiz yok" }, { status: 403 });

    const total = order.items.reduce((sum, i) => sum + i.quantity * Number(i.unitPrice), 0);
    const collected = order.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const remaining = Math.max(0, total - collected);

    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

    doc.fontSize(20).text("Cdrive", { continued: true }).fontSize(12).text("  — Siparis Makbuzu");
    doc.moveDown(0.5);
    doc.fontSize(9).fillColor("#666").text(`Siparis No: ${order.id}`);
    doc.text(`Tarih: ${formatDate(order.createdAt.toISOString())}`);
    doc.text(`Durum: ${STATUS_LABEL[order.status] ?? order.status}`);
    doc.fillColor("#000");
    doc.moveDown();

    doc.fontSize(12).text("Musteri", { underline: true });
    doc.fontSize(10).text(pdfSafe(order.customerName));
    if (order.customerContact) doc.text(pdfSafe(order.customerContact));
    doc.moveDown();

    doc.fontSize(12).text("Kalemler", { underline: true });
    doc.moveDown(0.3);
    const colX = [50, 300, 370, 460];
    doc.fontSize(9).fillColor("#666");
    doc.text("Urun/Hizmet", colX[0], doc.y, { continued: false });
    doc.text("Adet", colX[1], doc.y - 11);
    doc.text("Birim", colX[2], doc.y - 11);
    doc.text("Toplam", colX[3], doc.y - 11);
    doc.fillColor("#000");
    doc.moveDown(0.3);
    for (const item of order.items) {
      const y = doc.y;
      doc.fontSize(10).text(pdfSafe(item.productName), colX[0], y, { width: 240 });
      doc.text(String(item.quantity), colX[1], y);
      doc.text(formatCurrencyTL(item.unitPrice.toString()), colX[2], y);
      doc.text(formatCurrencyTL(item.quantity * Number(item.unitPrice)), colX[3], y);
      doc.moveDown(0.5);
    }
    doc.moveDown(0.5);
    doc.fontSize(11).text(`Toplam: ${formatCurrencyTL(total)}`, { align: "right" });
    doc.fontSize(10).fillColor("#16a34a").text(`Tahsil edilen: ${formatCurrencyTL(collected)}`, { align: "right" });
    doc.fillColor(remaining > 0 ? "#d97706" : "#000").text(`Kalan bakiye: ${formatCurrencyTL(remaining)}`, { align: "right" });
    doc.fillColor("#000");

    if (order.payments.length > 0) {
      doc.moveDown();
      doc.fontSize(12).text("Tahsilat gecmisi", { underline: true });
      doc.fontSize(9);
      for (const p of order.payments) {
        doc.text(`${formatDate(p.paidAt.toISOString())} — ${formatCurrencyTL(p.amount.toString())}${p.note ? ` (${pdfSafe(p.note)})` : ""}`);
      }
    }

    doc.moveDown(1.5);
    doc.fontSize(8).fillColor("#999").text(`Olusturan: ${pdfSafe(order.createdBy.name)}`, { align: "left" });

    doc.end();
    const buffer = await done;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="siparis-${order.id}.pdf"`,
        "Content-Length": String(buffer.byteLength),
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
