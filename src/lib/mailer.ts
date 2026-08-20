import nodemailer from "nodemailer";

/**
 * E-posta gönderimi — SMTP_HOST env değişkeni yoksa (yerel geliştirme, testler) tamamen
 * sessizce devre dışı kalır, hiçbir çağıran kod bunu kontrol etmek zorunda değil. Bir
 * gönderim başarısız olursa da HATA FIRLATMAZ — sadece konsola loglar; e-posta arızası
 * hiçbir zaman uygulamanın asıl işlemini (sipariş oluşturma, mesaj gönderme vb.) bozmasın.
 */
const globalForMailer = globalThis as unknown as { cdriveMailer?: ReturnType<typeof nodemailer.createTransport> };

function getTransport() {
  if (!process.env.SMTP_HOST) return null;
  if (!globalForMailer.cdriveMailer) {
    globalForMailer.cdriveMailer = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 465),
      secure: Number(process.env.SMTP_PORT ?? 465) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return globalForMailer.cdriveMailer;
}

export async function sendMail(opts: { to: string; subject: string; text: string }) {
  const transport = getTransport();
  if (!transport) return; // SMTP yapılandırılmamış — sessizce atla (yerel geliştirme/test)
  try {
    await transport.sendMail({
      from: process.env.MAIL_FROM ?? process.env.SMTP_USER,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
    });
  } catch (err) {
    console.error("[mailer] gönderilemedi:", opts.to, err);
  }
}
