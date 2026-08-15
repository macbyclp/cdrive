import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canAccessFile } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { errorResponse } from "@/lib/api-helpers";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { id, versionId } = await params;
    const user = await requireUser();
    const ok = await canAccessFile(user, id, "EDIT");
    if (!ok) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });

    const version = await prisma.fileVersion.findUnique({ where: { id: versionId } });
    if (!version || version.fileId !== id) {
      return NextResponse.json({ error: "Versiyon bulunamadı" }, { status: 404 });
    }

    const file = await prisma.file.findUniqueOrThrow({ where: { id } });
    const sizeDelta = version.size - file.size;

    const updated = await prisma.file.update({
      where: { id },
      data: { currentVersionId: version.id, size: version.size },
    });
    await prisma.user.update({
      where: { id: file.ownerId },
      data: { usedBytes: { increment: sizeDelta } },
    });
    await logAudit({
      userId: user.id,
      action: "RESTORE",
      targetType: "file",
      targetId: id,
      detail: `v${version.versionNo} geri yüklendi`,
    });
    return NextResponse.json({ ...updated, size: updated.size.toString() });
  } catch (err) {
    return errorResponse(err);
  }
}
