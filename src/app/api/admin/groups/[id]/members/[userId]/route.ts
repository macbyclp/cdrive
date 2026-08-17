import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { errorResponse } from "@/lib/api-helpers";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; userId: string }> }) {
  try {
    await requireRole("ADMIN");
    const { id, userId } = await params;
    await prisma.groupMember.delete({ where: { groupId_userId: { groupId: id, userId } } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
