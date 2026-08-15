import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { errorResponse } from "@/lib/api-helpers";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const link = await prisma.shareLink.findUnique({ where: { id } });
    if (!link) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });
    if (link.createdById !== user.id && user.role !== "ADMIN") {
      return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });
    }
    await prisma.shareLink.update({ where: { id }, data: { revoked: true } });
    await logAudit({ userId: user.id, action: "SHARE_REVOKE", targetType: "file", targetId: link.fileId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
