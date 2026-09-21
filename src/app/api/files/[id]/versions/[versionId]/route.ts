import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canAccessFile } from "@/lib/access";
import { deleteFile } from "@/lib/storage";
import { lockUser, adjustUsedBytes } from "@/lib/quota";
import { logAudit } from "@/lib/audit";
import { errorResponse } from "@/lib/api-helpers";

/**
 * Güncel OLMAYAN bir eski sürümü kalıcı siler ve kotayı geri kazandırır (eski sürümler kotaya
 * sayıldığı için, kullanıcının yer açabilmesinin yolu budur). Önce DB (transaction), sonra disk.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { id, versionId } = await params;
    const user = await requireUser();
    const ok = await canAccessFile(user, id, "EDIT");
    if (!ok) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });

    const version = await prisma.fileVersion.findUnique({ where: { id: versionId }, include: { file: true } });
    if (!version || version.fileId !== id) return NextResponse.json({ error: "Versiyon bulunamadı" }, { status: 404 });
    if (version.file.currentVersionId === version.id) {
      return NextResponse.json({ error: "Güncel sürüm silinemez" }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.fileVersion.delete({ where: { id: version.id } });
      if (!version.file.deletedAt) {
        await lockUser(tx, version.file.ownerId);
        await adjustUsedBytes(tx, version.file.ownerId, -version.size);
      }
    });
    await deleteFile(version.storageKey).catch(() => {});
    await logAudit({
      userId: user.id,
      action: "PURGE",
      targetType: "file",
      targetId: id,
      detail: `v${version.versionNo} silindi: ${version.file.name}`,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
