import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, verifyPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { errorResponse, limitOr429 } from "@/lib/api-helpers";
import { verifySecondFactor } from "@/lib/two-factor";
import { countRemainingRecoveryCodes, replaceRecoveryCodes } from "@/lib/recovery-codes";

/** Kalan (kullanılmamış) kurtarma kodu sayısı — kodların kendisi asla geri döndürülmez. */
export async function GET() {
  try {
    const user = await requireUser();
    if (!user.twoFactorEnabled) return NextResponse.json({ remaining: 0 });
    return NextResponse.json({ remaining: await countRemainingRecoveryCodes(user.id) });
  } catch (err) {
    return errorResponse(err);
  }
}

const schema = z.object({ password: z.string().min(1), code: z.string().min(6).max(16) });

/** Eski kodları geçersiz kılıp yeni 10 kod üretir. Parola + geçerli bir TOTP/kurtarma kodu gerekir. */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const limited = limitOr429("2fa-recovery", user.id, 10, 60_000);
    if (limited) return limited;
    if (!user.twoFactorEnabled) {
      return NextResponse.json({ error: "İki adımlı doğrulama kapalı" }, { status: 400 });
    }
    const { password, code } = schema.parse(await req.json());
    if (!(await verifyPassword(password, user.passwordHash))) {
      return NextResponse.json({ error: "Şifre hatalı" }, { status: 401 });
    }
    const factor = await verifySecondFactor(user, code);
    if (!factor.ok) {
      return NextResponse.json({ error: "Doğrulama kodu hatalı veya daha önce kullanılmış" }, { status: 401 });
    }
    const recoveryCodes = await replaceRecoveryCodes(user.id);
    await logAudit({ userId: user.id, action: "TWO_FACTOR_ENABLE", detail: "Kurtarma kodları yenilendi" });
    return NextResponse.json({ recoveryCodes });
  } catch (err) {
    return errorResponse(err);
  }
}
