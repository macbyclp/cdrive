import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, verifyPassword, reissueSession, computeTwoFactorRequired } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { errorResponse } from "@/lib/api-helpers";

const schema = z.object({ password: z.string().min(1) });

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { password } = schema.parse(await req.json());
    if (!(await verifyPassword(password, user.passwordHash))) {
      return NextResponse.json({ error: "Şifre hatalı" }, { status: 401 });
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorLastStep: null },
    });
    await logAudit({ userId: user.id, action: "TWO_FACTOR_DISABLE" });

    // Admin için 2FA zorunluysa, kapatır kapatmaz aynı oturumda tekrar gate'lensin diye
    // (bir sonraki girişe kadar beklemeden) oturumu güncel bayrakla yeniden imzalıyoruz.
    const twoFactorRequired = await computeTwoFactorRequired({ role: user.role, twoFactorEnabled: false });
    await reissueSession({ twoFactorRequired });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
