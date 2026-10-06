import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUnrestrictedUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { errorResponse } from "@/lib/api-helpers";

/** Yükleme isteğini iptal eder (oluşturan ya da ADMIN). Daha önce yüklenen dosyalar yerinde kalır. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUnrestrictedUser();
    const r = await prisma.uploadRequest.findUnique({ where: { id } });
    if (!r || r.revoked) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });
    if (r.createdById !== user.id && user.role !== "ADMIN") {
      return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });
    }
    await prisma.uploadRequest.update({ where: { id }, data: { revoked: true } });
    await logAudit({ userId: user.id, action: "SHARE_REVOKE", targetType: "folder", targetId: r.folderId, detail: `dosya isteği iptal: ${r.title}` });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
