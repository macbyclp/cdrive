import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, startImpersonation } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { errorResponse, clientIp } from "@/lib/api-helpers";

/**
 * Admin, hedef kullanıcının şifresini hiç bilmeden/değiştirmeden "o kullanıcı olarak"
 * girer — destek/hata ayıklama için. Bilerek dar tutuldu: kendi hesabını, başka bir
 * admin'i veya henüz ilk kurulumunu (onboarding) tamamlamamış bir hesabı taklit edemez.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireRole("ADMIN");
    const { id } = await params;

    if (id === admin.id) {
      return NextResponse.json({ error: "Kendi hesabınızı taklit edemezsiniz" }, { status: 400 });
    }
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target || !target.active) {
      return NextResponse.json({ error: "Kullanıcı bulunamadı" }, { status: 404 });
    }
    if (target.role === "ADMIN") {
      return NextResponse.json({ error: "Başka bir admin hesabına giremezsiniz" }, { status: 403 });
    }
    if (target.mustChangePassword) {
      return NextResponse.json(
        { error: "Bu kullanıcı henüz ilk girişini tamamlamadı, taklit edilemez" },
        { status: 400 }
      );
    }

    await startImpersonation(admin, target, { ip: clientIp(req), userAgent: req.headers.get("user-agent") });
    await logAudit({
      userId: admin.id,
      action: "IMPERSONATE_START",
      targetType: "user",
      targetId: target.id,
      detail: `${admin.email} → "${target.name}" (${target.email}) olarak giriş yaptı`,
      ip: clientIp(req),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
