import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { errorResponse } from "@/lib/api-helpers";

export async function GET(req: Request) {
  try {
    await requireRole("ADMIN", "MANAGER");
    const { searchParams } = new URL(req.url);
    const take = Math.min(Number(searchParams.get("take") ?? 100) || 100, 300);
    const skip = Math.max(Number(searchParams.get("skip") ?? 0) || 0, 0);
    const where: Record<string, unknown> = {};
    const userId = searchParams.get("userId");
    const action = searchParams.get("action");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    if (userId) where.userId = userId;
    if (action) where.action = action;
    const range: { gte?: Date; lte?: Date } = {};
    if (from && !isNaN(Date.parse(from))) range.gte = new Date(from);
    if (to && !isNaN(Date.parse(to))) range.lte = new Date(to);
    if (range.gte || range.lte) where.createdAt = range;
    const logs = await prisma.auditLog.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true, email: true } } },
    });
    return NextResponse.json(logs);
  } catch (err) {
    return errorResponse(err);
  }
}
