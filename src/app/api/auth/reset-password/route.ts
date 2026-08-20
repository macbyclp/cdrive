import { NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { errorResponse, clientIp } from "@/lib/api-helpers";

const schema = z.object({ token: z.string().min(10), password: z.string().min(8) });

/** Token'ı gerçek şifreye çevirir — tek kullanımlık, 1 saatlik. Başarılı olursa güvenlik için TÜM oturumlar (bu isteği atan dahil) iptal edilir, kullanıcı yeni şifreyle tekrar giriş yapmalı. */
export async function POST(req: Request) {
  try {
    const ip = clientIp(req) ?? "unknown";
    if (!rateLimit(`reset-password:${ip}`, 10, 60_000)) {
      return NextResponse.json({ error: "Çok fazla deneme yapıldı, biraz sonra tekrar deneyin" }, { status: 429 });
    }

    const { token, password } = schema.parse(await req.json());
    const tokenHash = createHash("sha256").update(token).digest("hex");

    const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      return NextResponse.json({ error: "Bağlantının süresi dolmuş veya daha önce kullanılmış. Yeniden şifre sıfırlama isteği gönderin." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: record.userId } });
    if (!user || !user.active) {
      return NextResponse.json({ error: "Hesap bulunamadı" }, { status: 404 });
    }

    const passwordHash = await hashPassword(password);
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      // Aynı hesap için bekleyen diğer token'lar da geçersiz olsun.
      prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null, id: { not: record.id } }, data: { usedAt: new Date() } }),
      // Güvenlik: şifre sıfırlanınca TÜM açık oturumlar iptal edilir — hesap ele
      // geçirilmişse saldırganın oturumu da bu sıfırlamayla düşer.
      prisma.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);

    await logAudit({ userId: user.id, action: "PASSWORD_CHANGE", detail: "Şifremi unuttum akışıyla sıfırlandı", ip });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
