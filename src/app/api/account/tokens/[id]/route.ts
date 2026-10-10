import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { errorResponse } from "@/lib/api-helpers";

/** Anahtarı iptal et (anında geçersiz olur). Yalnızca sahibi. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const res = await prisma.apiToken.updateMany({ where: { id, userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    if (res.count === 0) return NextResponse.json({ error: "Anahtar bulunamadı" }, { status: 404 });
    await logAudit({ userId: user.id, action: "SETTINGS_UPDATE", detail: "Yapay zekâ erişim anahtarı iptal edildi" });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
