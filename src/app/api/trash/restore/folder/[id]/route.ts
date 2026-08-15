import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { restoreFolderRecursive } from "@/lib/trash";
import { logAudit } from "@/lib/audit";
import { errorResponse } from "@/lib/api-helpers";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const folder = await prisma.folder.findUnique({ where: { id } });
    if (!folder || !folder.deletedAt) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });
    if (folder.ownerId !== user.id && user.role !== "ADMIN") {
      return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });
    }

    await restoreFolderRecursive(id);
    await logAudit({ userId: user.id, action: "RESTORE", targetType: "folder", targetId: id, detail: folder.name });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
