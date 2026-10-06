import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSession, getPending2FA, clearPending2FA } from "@/lib/auth";
import { verifySecondFactor } from "@/lib/two-factor";
import { rateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { errorResponse, clientIp } from "@/lib/api-helpers";
import { notifyNewDeviceLogin } from "@/lib/login-alert";

// 6 haneli TOTP kodu ya da "xxxxx-xxxxx" kurtarma kodu.
const schema = z.object({ code: z.string().min(6).max(16) });

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

    const result = await verifySecondFactor(user, code);
    if (!result.ok) {
      const replay = result.reason === "replay";
      await logAudit({ userId: user.id, action: "LOGIN_FAILED", detail: replay ? "2FA kodu yeniden kullanıldı" : "2FA kodu hatalı", ip });
      return NextResponse.json(
        { error: replay ? "Bu kod zaten kullanıldı, yeni kodu bekleyin" : "Doğrulama kodu hatalı" },
        { status: 401 }
      );
    }

    await clearPending2FA();
    // Bu noktada user.twoFactorEnabled zaten true (yukarıda şart) — zorunluluk her zaman düşer.
    // remember: giriş ekranındaki seçim bekleyen-2FA çerezinde taşındı (bkz. createPending2FA).
    const userAgent = req.headers.get("user-agent");
    const sessionId = await createSession(
      { userId: user.id, email: user.email, name: user.name, role: user.role, mustChangePassword: user.mustChangePassword, twoFactorRequired: false, remember: pending.remember },
      { ip, userAgent }
    );
    void notifyNewDeviceLogin(user, sessionId, { ip, userAgent });
    await logAudit({ userId: user.id, action: "LOGIN", ip, detail: result.method === "recovery" ? "2FA kurtarma koduyla" : "2FA ile" });
    return NextResponse.json({ id: user.id, email: user.email, name: user.name, role: user.role });
  } catch (err) {
    return errorResponse(err);
  }
}
