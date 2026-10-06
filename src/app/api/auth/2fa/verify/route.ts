import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSession, getPending2FA, clearPending2FA } from "@/lib/auth";
import { matchTotpStep } from "@/lib/totp";
import { rateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { errorResponse, clientIp } from "@/lib/api-helpers";

const schema = z.object({ code: z.string().min(6).max(6) });

export async function POST(req: Request) {
  try {
    const pending = await getPending2FA();
    if (!pending) return NextResponse.json({ error: "Oturum süresi doldu, tekrar giriş yapın" }, { status: 401 });

    const ip = clientIp(req) ?? "unknown";
    if (!rateLimit(`2fa:${pending.userId}`, 10, 60_000)) {
      return NextResponse.json({ error: "Çok fazla deneme yapıldı, biraz sonra tekrar deneyin" }, { status: 429 });
    }

    const { code } = schema.parse(await req.json());
    const user = await prisma.user.findUnique({ where: { id: pending.userId } });
    if (!user || !user.active || !user.twoFactorEnabled || !user.twoFactorSecret) {
      return NextResponse.json({ error: "Geçersiz istek" }, { status: 401 });
    }

    const step = matchTotpStep(code, user.twoFactorSecret);
    if (step === null) {
      await logAudit({ userId: user.id, action: "LOGIN_FAILED", detail: "2FA kodu hatalı", ip });
      return NextResponse.json({ error: "Doğrulama kodu hatalı" }, { status: 401 });
    }
    // Tekrar kullanım koruması: bir kod (ve daha eski adımlar) yalnız BİR kez kabul edilir. Koşullu UPDATE
    // atomiktir; aynı kodla eşzamanlı iki istekten yalnız biri geçer.
    const claimed = await prisma.user.updateMany({
      where: { id: user.id, OR: [{ twoFactorLastStep: null }, { twoFactorLastStep: { lt: step } }] },
      data: { twoFactorLastStep: step },
    });
    if (claimed.count === 0) {
      await logAudit({ userId: user.id, action: "LOGIN_FAILED", detail: "2FA kodu yeniden kullanıldı", ip });
      return NextResponse.json({ error: "Bu kod zaten kullanıldı, yeni kodu bekleyin" }, { status: 401 });
    }

    await clearPending2FA();
    // Bu noktada user.twoFactorEnabled zaten true (yukarıda şart) — zorunluluk her zaman düşer.
    // remember: giriş ekranındaki seçim bekleyen-2FA çerezinde taşındı (bkz. createPending2FA).
    await createSession(
      { userId: user.id, email: user.email, name: user.name, role: user.role, mustChangePassword: user.mustChangePassword, twoFactorRequired: false, remember: pending.remember },
      { ip, userAgent: req.headers.get("user-agent") }
    );
    await logAudit({ userId: user.id, action: "LOGIN", ip, detail: "2FA ile" });
    return NextResponse.json({ id: user.id, email: user.email, name: user.name, role: user.role });
  } catch (err) {
    return errorResponse(err);
  }
}
