import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/api-helpers";

// Varsayılan: en yeni 30 bildirim (eski davranış). Eski bildirimlere erişim: `?before=<ISO tarih>&limit=<1-100>`
// (cursor tabanlı; `hasMore` yanıtta döner).
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const sp = new URL(req.url).searchParams;
    const limit = Math.min(Math.max(Number(sp.get("limit") ?? 30) || 30, 1), 100);
    const beforeRaw = sp.get("before");
    const before = beforeRaw && !isNaN(Date.parse(beforeRaw)) ? new Date(beforeRaw) : null;
    const [rows, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: user.id, ...(before ? { createdAt: { lt: before } } : {}) },
        orderBy: { createdAt: "desc" },
        take: limit + 1,
      }),
      prisma.notification.count({ where: { userId: user.id, read: false } }),
    ]);
    const hasMore = rows.length > limit;
    return NextResponse.json({ notifications: rows.slice(0, limit), unreadCount, hasMore });
  } catch (err) {
    return errorResponse(err);
  }
}
