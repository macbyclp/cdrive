import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/api-helpers";

export async function GET() {
  try {
    const user = await requireUser();
    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      prisma.notification.count({ where: { userId: user.id, read: false } }),
    ]);
    return NextResponse.json({ notifications, unreadCount });
  } catch (err) {
    return errorResponse(err);
  }
}
