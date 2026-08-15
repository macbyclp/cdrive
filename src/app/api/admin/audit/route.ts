import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { errorResponse } from "@/lib/api-helpers";

export async function GET(req: Request) {
  try {
    await requireRole("ADMIN", "MANAGER");
    const { searchParams } = new URL(req.url);
    const take = Math.min(Number(searchParams.get("take") ?? 100), 300);
    const logs = await prisma.auditLog.findMany({
      take,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true, email: true } } },
    });
    return NextResponse.json(logs);
  } catch (err) {
    return errorResponse(err);
  }
}
