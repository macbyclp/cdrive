import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, verifyPassword, reissueSession, computeTwoFactorRequired } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { errorResponse, limitOr429 } from "@/lib/api-helpers";
import { verifySecondFactor } from "@/lib/two-factor";
import { deleteRecoveryCodes } from "@/lib/recovery-codes";

// Kapatmak için parolaya EK olarak geçerli bir TOTP ya da kurtarma kodu gerekir (çalıntı oturum 2FA'yı tek başına söküp atamasın).
const schema = z.object({ password: z.string().min(1), code: z.string().min(6).max(16) });

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const limited = limitOr429("2fa-disable", user.id, 10, 60_000);
    if (limited) return limited;
    const { password, code } = schema.parse(await req.json());
    if (!(await verifyPassword(password, user.passwordHash))) {
      return NextResponse.json({ error: "Şifre hatalı" }, { status: 401 });
    }
    const factor = await verifySecondFactor(user, code);
    if (!factor.ok) {
      return NextResponse.json({ error: "Doğrulama kodu hatalı veya daha önce kullanılmış" }, { status: 401 });
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorLastStep: null },
    });
    await deleteRecoveryCodes(user.id);
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
