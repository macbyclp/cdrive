import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { errorResponse } from "@/lib/api-helpers";
import { monthlyRevenueSeries } from "@/lib/reports";

// ?months=12 — kaç aylık ciro/tahsilat serisi isteniyor. coerce: query param hep
// string gelir; geçersiz değer ZodError fırlatır, errorResponse 400'e çevirir.
const querySchema = z.object({
  months: z.coerce.number().int().min(1).max(36).default(12),
});

/**
 * Aylık ciro/tahsilat serisi (ADMIN) — rapor ekranının grafik verisi.
 *
 * Para hesabı SQL'de değil JS tarafında: Prisma Decimal alanlarıyla aggregate/
 * groupBy tutarlı çalışmaz, repo pattern'i include ile çekip lib fonksiyonlarıyla
 * reduce etmek (bkz. /api/dashboard). Ciro = orderTotal (siparişin YARATILDIĞI ay),
 * tahsilat = orderCollected (ödemenin paidAt AYI — sipariş ayından bağımsız).
 */
export async function GET(req: Request) {
  try {
    await requireRole("ADMIN");

    const { months } = querySchema.parse({ months: new URL(req.url).searchParams.get("months") ?? undefined });

    // Pencere başlangıcı: görünen en eski ayın 1'i (yerel zaman). Hem siparişlerin
    // createdAt'i hem ödemelerin paidAt'i için aynı pencere kullanılır — months=12
    // istenince seri tam 12 satır döner.
    const now = new Date();
    const windowStart = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);

    const [orders, payments] = await Promise.all([
      prisma.order.findMany({
        where: { createdAt: { gte: windowStart } },
        include: { items: true, payments: true },
      }),
      prisma.payment.findMany({
        where: { paidAt: { gte: windowStart } },
        select: { amount: true, paidAt: true, orderId: true },
      }),
    ]);

    return NextResponse.json({ months: monthlyRevenueSeries(orders, payments, months) });
  } catch (err) {
    return errorResponse(err);
  }
}
