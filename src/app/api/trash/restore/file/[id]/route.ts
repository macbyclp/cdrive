import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { assertQuota } from "@/lib/access";
import { lockUser, adjustUsedBytes, versionBytesByOwner } from "@/lib/quota";
import { logAudit } from "@/lib/audit";
import { errorResponse } from "@/lib/api-helpers";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const file = await prisma.file.findUnique({ where: { id } });
    if (!file || !file.deletedAt) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });
    if (file.ownerId !== user.id && user.role !== "ADMIN") {
      return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });
    }

    // Dosyanın bulunduğu klasör de çöp kutusundaysa dosyayı Sürücüm köküne geri getir,
    // aksi halde geride kalıp görünmez ("hayalet") olmasın.
    let folderId = file.folderId;
    if (folderId) {
      const folder = await prisma.folder.findUnique({ where: { id: folderId } });
      if (!folder || folder.deletedAt) folderId = null;
    }

    await prisma.$transaction(async (tx) => {
      // Geri yüklemek kotayı (tüm sürümler dahil) yeniden tüketir; kilit altında kontrol edilir.
      await lockUser(tx, file.ownerId);
      const owner = await tx.user.findUniqueOrThrow({ where: { id: file.ownerId } });
      const needed = (await versionBytesByOwner(tx, [file])).get(file.ownerId) ?? 0n;
      await assertQuota(owner, needed, tx);
      await tx.file.update({ where: { id }, data: { deletedAt: null, folderId } });
      await adjustUsedBytes(tx, file.ownerId, needed);
    });
    await logAudit({ userId: user.id, action: "RESTORE", targetType: "file", targetId: id, detail: file.name });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
