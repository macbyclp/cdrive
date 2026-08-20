import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, createSession } from "@/lib/auth";
import { verifyTotpToken } from "@/lib/totp";
import { logAudit } from "@/lib/audit";
import { errorResponse, clientIp } from "@/lib/api-helpers";

const schema = z.object({ code: z.string().min(6).max(6) });

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (!user.twoFactorSecret) {
      return NextResponse.json({ error: "Önce /setup ile bir anahtar oluşturun" }, { status: 400 });
    }
    const { code } = schema.parse(await req.json());
    if (!verifyTotpToken(code, user.twoFactorSecret)) {
      return NextResponse.json({ error: "Doğrulama kodu hatalı" }, { status: 401 });
    }
    await prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: true } });
    await logAudit({ userId: user.id, action: "TWO_FACTOR_ENABLE" });

    // JWT'deki eski twoFactorRequired=true bayrağı yeni oturum açılana kadar geçerli kalır —
    // middleware'in hemen tekrar /account'a kilitlememesi için oturumu burada yeniden imzalıyoruz
    // (mustChangePassword'daki "JWT re-mint" ile aynı desen).
    await createSession(
      { userId: user.id, email: user.email, name: user.name, role: user.role, mustChangePassword: user.mustChangePassword, twoFactorRequired: false },
      { ip: clientIp(req), userAgent: req.headers.get("user-agent") }
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
