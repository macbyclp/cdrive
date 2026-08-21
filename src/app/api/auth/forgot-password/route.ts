import { NextResponse } from "next/server";
import { z } from "zod";
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { errorResponse, clientIp } from "@/lib/api-helpers";
import { sendMail, appBaseUrl } from "@/lib/mailer";
import { passwordResetEmail } from "@/lib/email-templates";
import { getOrgName } from "@/lib/org";

const schema = z.object({ email: z.string().email() });
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 saat

/**
 * "Şifremi unuttum" — kasıtlı olarak e-postanın var olup olmadığına göre FARKLI bir yanıt
 * vermiyor (kullanıcı numaralandırma/enumeration saldırısını önlemek için): hem var olan hem
 * olmayan bir e-posta için aynı genel "gönderildi" mesajı döner. Sadece hesap gerçekten var,
 * aktifse ve şifresi varsa (ilk-giriş onboarding'i tamamlanmamış hesaplara token gönderilmez —
 * o akış zaten admin'in belirlediği geçici şifreyle /onboarding'e yönleniyor) e-posta gider.
 */
export async function POST(req: Request) {
  try {
    const ip = clientIp(req) ?? "unknown";
    if (!rateLimit(`forgot-password:${ip}`, 5, 60_000)) {
      return NextResponse.json({ error: "Çok fazla deneme yapıldı, biraz sonra tekrar deneyin" }, { status: 429 });
    }

    const { email } = schema.parse(await req.json());
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

    if (user && user.active && !user.mustChangePassword) {
      // Aynı hesap için eski, henüz kullanılmamış token'ları geçersizleştir — birden fazla
      // istek atılırsa sadece en son gönderilen bağlantı çalışsın.
      await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });

      const rawToken = randomBytes(32).toString("base64url");
      const tokenHash = createHash("sha256").update(rawToken).digest("hex");
      await prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + TOKEN_TTL_MS) },
      });

      const resetUrl = `${appBaseUrl()}/reset-password?token=${rawToken}`;
      const orgName = await getOrgName();
      const { subject, html, text } = passwordResetEmail({ name: user.name, resetUrl, orgName });
      void sendMail({ to: user.email, subject, html, text });
    }

    return NextResponse.json({ ok: true, message: "Bu e-posta adresine kayıtlı bir hesap varsa, şifre sıfırlama bağlantısı gönderildi." });
  } catch (err) {
    return errorResponse(err);
  }
}
