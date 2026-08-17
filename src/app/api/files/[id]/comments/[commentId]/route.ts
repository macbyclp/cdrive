import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/api-helpers";

/** Bir yorumu siler — yalnızca yazan kişi veya admin. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; commentId: string }> }) {
  try {
    const { id, commentId } = await params;
    const user = await requireUser();
    const comment = await prisma.fileComment.findUnique({ where: { id: commentId } });
    if (!comment || comment.fileId !== id) {
      return NextResponse.json({ error: "Yorum bulunamadı" }, { status: 404 });
    }
    if (comment.userId !== user.id && user.role !== "ADMIN") {
      return NextResponse.json({ error: "Bu yorumu silme yetkiniz yok" }, { status: 403 });
    }
    await prisma.fileComment.delete({ where: { id: commentId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
