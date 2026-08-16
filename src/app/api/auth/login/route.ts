import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSession, verifyPassword, isLocked, registerFailedLogin, clearFailedLogins, createPending2FA } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { errorResponse, clientIp } from "@/lib/api-helpers";

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(req: Request) {
  try {
    const ip = clientIp(req) ?? "unknown";
    // IP başına dakikada 15 giriş denemesiyle sınırla — hesap bazlı kilitlemeden
    // ayrı, farklı hesapları deneyen bir saldırganı da yavaşlatır.
    if (!rateLimit(`login:${ip}`, 15, 60_000)) {
      return NextResponse.json({ error: "Çok fazla deneme yapıldı, biraz sonra tekrar deneyin" }, { status: 429 });
    }

    const { email, password } = schema.parse(await req.json());
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

    if (user && isLocked(user)) {
      const minutes = Math.ceil((user.lockedUntil!.getTime() - Date.now()) / 60_000);
      return NextResponse.json(
        { error: `Çok fazla başarısız deneme nedeniyle hesap kilitlendi. ${minutes} dakika sonra tekrar deneyin.` },
        { status: 423 }
      );
    }

    if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
      if (user) {
        const justLocked = await registerFailedLogin(user.id, user.failedLoginAttempts);
        if (justLocked) {
          await logAudit({ userId: user.id, action: "LOGIN_FAILED", detail: `${email} — 5 başarısız deneme sonrası kilitlendi`, ip });
          return NextResponse.json(
            { error: "Çok fazla başarısız deneme nedeniyle hesap 15 dakika kilitlendi." },
            { status: 423 }
          );
        }
      }
      await logAudit({ action: "LOGIN_FAILED", detail: email, ip });
      return NextResponse.json({ error: "E-posta veya şifre hatalı" }, { status: 401 });
    }

    await clearFailedLogins(user.id);

    if (user.twoFactorEnabled) {
      await createPending2FA(user.id);
      return NextResponse.json({ requiresTwoFactor: true });
    }

    await createSession(
      { userId: user.id, email: user.email, name: user.name, role: user.role },
      { ip, userAgent: req.headers.get("user-agent") }
    );
    await logAudit({ userId: user.id, action: "LOGIN", ip });
    return NextResponse.json({ id: user.id, email: user.email, name: user.name, role: user.role });
  } catch (err) {
    return errorResponse(err);
  }
}
