import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { purgeFile } from "@/lib/trash";
import { logAudit } from "@/lib/audit";
import { errorResponse } from "@/lib/api-helpers";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const file = await prisma.file.findUnique({ where: { id } });
    if (!file || !file.deletedAt) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });
    if (file.ownerId !== user.id && user.role !== "ADMIN") {
      return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });
    }

    await purgeFile(id);
    await logAudit({ userId: user.id, action: "PURGE", targetType: "file", targetId: id, detail: file.name });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
