import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canManageOrders } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { errorResponse } from "@/lib/api-helpers";
import { formatCurrencyTL } from "@/lib/format";

/** Hatalı/yanlış girilmiş bir tahsilat kaydını siler — sadece muhasebe (canManageOrders) veya admin. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; paymentId: string }> }) {
  try {
    const user = await requireUser();
    if (!canManageOrders(user)) return NextResponse.json({ error: "Tahsilat silme yetkiniz yok" }, { status: 403 });

    const { id, paymentId } = await params;
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.orderId !== id) {
      return NextResponse.json({ error: "Tahsilat kaydı bulunamadı" }, { status: 404 });
    }

    await prisma.payment.delete({ where: { id: paymentId } });
    await logAudit({
      userId: user.id,
      action: "PAYMENT_DELETE",
      targetType: "order",
      targetId: id,
      detail: `${formatCurrencyTL(payment.amount.toString())} tutarındaki tahsilat kaydı silindi`,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
