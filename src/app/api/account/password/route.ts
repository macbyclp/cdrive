import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, hashPassword, verifyPassword, getSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { errorResponse } from "@/lib/api-helpers";
import { assertPasswordPolicy } from "@/lib/password-policy";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { currentPassword, newPassword } = schema.parse(await req.json());

    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      return NextResponse.json({ error: "Mevcut şifre hatalı" }, { status: 401 });
    }

    assertPasswordPolicy(newPassword, { email: user.email, name: user.name });
    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    // Şifre değişince BU oturum dışındaki tüm oturumlar kapanır (ele geçirilmiş oturum sürmesin).
    const current = await getSession();
    await prisma.session.updateMany({
      where: { userId: user.id, revokedAt: null, ...(current?.sessionId ? { id: { not: current.sessionId } } : {}) },
      data: { revokedAt: new Date() },
    });
    await logAudit({ userId: user.id, action: "PASSWORD_CHANGE" });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
