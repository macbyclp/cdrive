import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, reissueSession } from "@/lib/auth";
import { matchTotpStep } from "@/lib/totp";
import { logAudit } from "@/lib/audit";
import { replaceRecoveryCodes } from "@/lib/recovery-codes";
import { errorResponse } from "@/lib/api-helpers";

const schema = z.object({ code: z.string().min(6).max(6) });

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (!user.twoFactorSecret) {
      return NextResponse.json({ error: "Önce /setup ile bir anahtar oluşturun" }, { status: 400 });
    }
    const { code } = schema.parse(await req.json());
    const step = matchTotpStep(code, user.twoFactorSecret);
    if (step === null) {
      return NextResponse.json({ error: "Doğrulama kodu hatalı" }, { status: 401 });
    }
    // Etkinleştirmede kullanılan kod, hemen ardından girişte yeniden kullanılamasın.
    await prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: true, twoFactorLastStep: step } });
    await logAudit({ userId: user.id, action: "TWO_FACTOR_ENABLE" });

    // JWT'deki eski twoFactorRequired=true bayrağı yeni oturum açılana kadar geçerli kalır —
    // middleware'in hemen tekrar /account'a kilitlememesi için oturumu burada yeniden imzalıyoruz
    // (mustChangePassword'daki "JWT re-mint" ile aynı desen).
    await reissueSession({ twoFactorRequired: false });

    // Kurtarma kodları yalnız burada, bir kez gösterilir (DB'de hash'i durur).
    const recoveryCodes = await replaceRecoveryCodes(user.id);
    return NextResponse.json({ ok: true, recoveryCodes });
  } catch (err) {
    return errorResponse(err);
  }
}
