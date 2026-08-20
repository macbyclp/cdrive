import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canCreateOrder, canManageOrders } from "@/lib/access";
import { formatCurrencyTL, formatDate, orderDisplayNumber } from "@/lib/format";
import { pdfSafe } from "@/lib/pdf-text";
import { errorResponse } from "@/lib/api-helpers";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Beklemede",
  APPROVED: "Onaylandi",
  IN_PRODUCTION: "Uretimde",
  INVOICED: "Faturalandi",
  CANCELLED: "Iptal",
};

const DISCLAIMER =
  "Bu belge resmi bir fatura veya vergi belgesi degildir. Sadece bu platformun kullanicilari " +
  "(calisanlari) arasinda dahili bilgilendirme/ozet amaciyla otomatik olusturulmustur; " +
  "yasal/mali gecerliligi yoktur.";

const MARGIN = 40;
const PAGE_WIDTH = 595.28; // A4
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

/** Bir siparişin dahili özet PDF'ini üretir — sipariş detayını görebilen herkes indirebilir. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        createdBy: { select: { name: true } },
        items: true,
        payments: { orderBy: { paidAt: "asc" }, include: { recordedBy: { select: { name: true } } } },
      },
    });
    if (!order) return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });

    const ok = canManageOrders(user) || (canCreateOrder(user) && order.createdById === user.id);
    if (!ok) return NextResponse.json({ error: "Bu siparişe erişiminiz yok" }, { status: 403 });

    const total = order.items.reduce((sum, i) => sum + i.quantity * Number(i.unitPrice), 0);
    const collected = order.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const remaining = Math.max(0, total - collected);

    const doc = new PDFDocument({ size: "A4", margin: MARGIN });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

    // --- Üst başlık bandı ---
    doc.rect(0, 0, PAGE_WIDTH, 70).fill("#4338ca");
    doc.fillColor("#fff").fontSize(18).font("Helvetica-Bold").text("Cdrive", MARGIN, 22);
    doc
      .fontSize(10)
      .font("Helvetica")
      .text("Dahili siparis ozeti", MARGIN, 44);
    doc
      .fontSize(9)
      .text(`Siparis No: ${orderDisplayNumber(order)}`, MARGIN, 22, { width: CONTENT_WIDTH, align: "right" })
      .text(`Tarih: ${formatDate(order.createdAt.toISOString())}`, { width: CONTENT_WIDTH, align: "right" })
      .text(`Durum: ${STATUS_LABEL[order.status] ?? order.status}`, { width: CONTENT_WIDTH, align: "right" });

    let y = 90;

    // --- Uyarı kutusu ---
    doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 34, 4).fillAndStroke("#fef3c7", "#f59e0b");
    doc.fillColor("#92400e").fontSize(8).font("Helvetica").text(pdfSafe(DISCLAIMER), MARGIN + 10, y + 7, {
      width: CONTENT_WIDTH - 20,
      lineGap: 1,
    });
    y += 46;

    // --- Müşteri bilgisi ---
    doc.fillColor("#111827").fontSize(11).font("Helvetica-Bold").text("Musteri", MARGIN, y);
    y += 16;
    doc.fontSize(10).font("Helvetica").fillColor("#374151").text(pdfSafe(order.customerName), MARGIN, y);
    y += 14;
    if (order.customerContact) {
      doc.fillColor("#6b7280").text(pdfSafe(order.customerContact), MARGIN, y);
      y += 14;
    }
    doc.fillColor("#6b7280").text(`Olusturan: ${pdfSafe(order.createdBy.name)}`, MARGIN, y);
    y += 22;

    // --- Kalemler tablosu ---
    doc.fillColor("#111827").fontSize(11).font("Helvetica-Bold").text("Kalemler", MARGIN, y);
    y += 18;

    const colX = [MARGIN, MARGIN + 260, MARGIN + 340, MARGIN + 430];
    const colW = [260, 80, 90, CONTENT_WIDTH - 430];

    doc.rect(MARGIN, y, CONTENT_WIDTH, 20).fill("#f3f4f6");
    doc.fillColor("#374151").fontSize(9).font("Helvetica-Bold");
    doc.text("Urun/Hizmet", colX[0] + 6, y + 6, { width: colW[0] - 6 });
    doc.text("Adet", colX[1], y + 6, { width: colW[1], align: "right" });
    doc.text("Birim", colX[2], y + 6, { width: colW[2], align: "right" });
    doc.text("Toplam", colX[3], y + 6, { width: colW[3] - 6, align: "right" });
    y += 20;

    doc.font("Helvetica").fontSize(9.5);
    for (const item of order.items) {
      const rowH = 20;
      doc.fillColor("#111827").text(pdfSafe(item.productName), colX[0] + 6, y + 5, { width: colW[0] - 10 });
      doc.fillColor("#374151").text(String(item.quantity), colX[1], y + 5, { width: colW[1], align: "right" });
      doc.text(formatCurrencyTL(item.unitPrice.toString()), colX[2], y + 5, { width: colW[2], align: "right" });
      doc
        .fillColor("#111827")
        .text(formatCurrencyTL(item.quantity * Number(item.unitPrice)), colX[3], y + 5, {
          width: colW[3] - 6,
          align: "right",
        });
      y += rowH;
      doc
        .strokeColor("#e5e7eb")
        .lineWidth(0.5)
        .moveTo(MARGIN, y)
        .lineTo(MARGIN + CONTENT_WIDTH, y)
        .stroke();
    }
    doc.rect(MARGIN, y - 0.5, CONTENT_WIDTH, 0.5).stroke("#d1d5db");
    y += 14;

    // --- Toplamlar ---
    const totalsX = MARGIN + CONTENT_WIDTH - 220;
    doc.font("Helvetica").fontSize(10).fillColor("#374151");
    doc.text("Toplam", totalsX, y, { width: 130 });
    doc.font("Helvetica-Bold").fillColor("#111827").text(formatCurrencyTL(total), totalsX + 130, y, { width: 90, align: "right" });
    y += 16;
    doc.font("Helvetica").fillColor("#374151").text("Tahsil edilen", totalsX, y, { width: 130 });
    doc.font("Helvetica-Bold").fillColor("#16a34a").text(formatCurrencyTL(collected), totalsX + 130, y, { width: 90, align: "right" });
    y += 16;
    doc.font("Helvetica").fillColor("#374151").text("Kalan bakiye", totalsX, y, { width: 130 });
    doc
      .font("Helvetica-Bold")
      .fillColor(remaining > 0 ? "#d97706" : "#111827")
      .text(formatCurrencyTL(remaining), totalsX + 130, y, { width: 90, align: "right" });
    y += 26;

    // --- Tahsilat geçmişi ---
    if (order.payments.length > 0) {
      doc.fillColor("#111827").fontSize(11).font("Helvetica-Bold").text("Tahsilat gecmisi", MARGIN, y);
      y += 16;
      doc.font("Helvetica").fontSize(9);
      for (const p of order.payments) {
        const line = `${formatDate(p.paidAt.toISOString())} — ${formatCurrencyTL(p.amount.toString())} — ${pdfSafe(p.recordedBy.name)}${p.note ? ` (${pdfSafe(p.note)})` : ""}`;
        doc.fillColor("#374151").text(line, MARGIN, y, { width: CONTENT_WIDTH });
        y += 14;
      }
      y += 8;
    }

    // --- Alt bilgi ---
    doc
      .fontSize(7.5)
      .fillColor("#9ca3af")
      .text(pdfSafe(DISCLAIMER), MARGIN, 792 - MARGIN - 20, { width: CONTENT_WIDTH, align: "center" });

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
