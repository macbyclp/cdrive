import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canManageOrders } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { errorResponse } from "@/lib/api-helpers";
import { formatCurrencyTL } from "@/lib/format";
import { notifyUser } from "@/lib/notify";

const createSchema = z.object({
  amount: z.number().min(0.01).max(100_000_000),
  method: z.enum(["CASH", "BANK_TRANSFER", "CREDIT_CARD", "OTHER"]).default("OTHER"),
  note: z.string().trim().max(2000).optional(),
  paidAt: z.string().datetime().optional(),
});

/** Bir siparişe tahsilat kaydı ekler — sadece muhasebe (canManageOrders) veya admin. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!canManageOrders(user)) return NextResponse.json({ error: "Tahsilat kaydetme yetkiniz yok" }, { status: 403 });

    const { id } = await params;
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });
    if (order.status === "CANCELLED") {
      return NextResponse.json({ error: "İptal edilmiş bir siparişe tahsilat eklenemez" }, { status: 400 });
    }

    const body = createSchema.parse(await req.json());

    const payment = await prisma.payment.create({
      data: {
        orderId: id,
        amount: body.amount,
        method: body.method,
        note: body.note || null,
        paidAt: body.paidAt ? new Date(body.paidAt) : undefined,
        recordedById: user.id,
      },
      include: { recordedBy: { select: { id: true, name: true, email: true } } },
    });

    await logAudit({
      userId: user.id,
      action: "PAYMENT_RECORD",
      targetType: "order",
      targetId: id,
      detail: `${formatCurrencyTL(body.amount)} tahsilat kaydedildi (${order.customerName})`,
    });

    if (order.createdById !== user.id) {
      await notifyUser({
        userId: order.createdById,
        type: "PAYMENT_RECORDED",
        message: `"${order.customerName}" siparişi için ${formatCurrencyTL(body.amount)} tahsilat kaydedildi`,
        targetType: "order",
        targetId: id,
      });
    }

    return NextResponse.json({ ...payment, amount: payment.amount.toString() });
  } catch (err) {
    return errorResponse(err);
  }
}
