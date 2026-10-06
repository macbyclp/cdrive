import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, verifyPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { errorResponse, clientIp, limitOr429 } from "@/lib/api-helpers";
import { deleteRecoveryCodes } from "@/lib/recovery-codes";
import { sendMail } from "@/lib/mailer";
import { genericNotificationEmail } from "@/lib/email-templates";
import { getOrgName } from "@/lib/org";

const schema = z.object({ password: z.string().min(1) });

/**
 * Yönetici, telefonunu ve kurtarma kodlarını kaybeden kullanıcının 2FA'sını sıfırlar. İşlem hassas:
 *  - yalnız ADMIN, yönetici kendi parolasını yeniden girer (çalıntı oturum başkasının 2FA'sını söküp atamasın),
 *  - kendi hesabına uygulanamaz (kendi 2FA'nı kapatmak için /account'taki kod şartlı akış var),
 *  - hedefin TÜM oturumları kapanır, kullanıcıya e-posta gider, denetim kaydına yazılır.
 * "Adminler için 2FA zorunlu" açıksa hedef bir ADMIN ise bir sonraki girişte yeniden kurmaya yönlendirilir.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireRole("ADMIN");
    const limited = limitOr429("reset-2fa", admin.id, 10, 60_000);
    if (limited) return limited;
    const { id } = await params;
    const { password } = schema.parse(await req.json());

    if (id === admin.id) {
      return NextResponse.json({ error: "Kendi 2FA'nızı Hesap sayfasından (doğrulama koduyla) kapatın" }, { status: 400 });
    }
    if (!(await verifyPassword(password, admin.passwordHash))) {
      return NextResponse.json({ error: "Şifreniz hatalı" }, { status: 401 });
    }
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return NextResponse.json({ error: "Kullanıcı bulunamadı" }, { status: 404 });
    if (!target.twoFactorEnabled) return NextResponse.json({ error: "Bu kullanıcının 2FA'sı zaten kapalı" }, { status: 400 });

    await prisma.user.update({
      where: { id },
      data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorLastStep: null },
    });
    await deleteRecoveryCodes(id);
    await prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await logAudit({
      userId: admin.id,
      action: "TWO_FACTOR_DISABLE",
      targetType: "user",
      targetId: id,
      detail: `${target.email} için 2FA yönetici tarafından sıfırlandı`,
      ip: clientIp(req),
    });

    const orgName = await getOrgName();
    const { subject, html, text } = genericNotificationEmail({
      heading: "İki adımlı doğrulamanız sıfırlandı",
      message: `Merhaba ${target.name}, yöneticiniz hesabınızın iki adımlı doğrulamasını sıfırladı ve tüm oturumlarınız kapatıldı. Bu talebi siz yapmadıysanız hemen yöneticinizle iletişime geçin. Giriş yaptıktan sonra Hesap sayfasından 2FA'yı yeniden kurmanızı öneririz.`,
      orgName,
    });
    void sendMail({ to: target.email, subject, html, text });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
