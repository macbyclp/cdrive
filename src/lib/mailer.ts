import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";

/**
 * E-posta gönderimi — SMTP ayarları artık admin panelinden (SystemSettings) giriliyor,
 * env değişkeni/SSH gerekmez. DB'de bir alan boşsa geçiş dönemi için ilgili env
 * değişkenine (SMTP_HOST/PORT/USER/PASS/MAIL_FROM) düşülür — hiçbiri yoksa (yerel
 * geliştirme, testler) tamamen sessizce devre dışı kalır. Bir gönderim başarısız
 * olursa da HATA FIRLATMAZ — sadece konsola loglar; e-posta arızası hiçbir zaman
 * uygulamanın asıl işlemini (sipariş oluşturma, mesaj gönderme vb.) bozmasın.
 */
const globalForMailer = globalThis as unknown as {
  cdriveMailer?: ReturnType<typeof nodemailer.createTransport>;
  cdriveMailerKey?: string;
};

export type SmtpConfig = { host: string; port: number; user: string | null; pass: string | null; from: string | null };

/** Admin panelinden girilmiş ayarları env fallback'iyle birleştirir — host boşsa null (yapılandırılmamış). */
export async function getSmtpConfig(): Promise<SmtpConfig | null> {
  const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });
  const host = settings?.smtpHost || process.env.SMTP_HOST;
  if (!host) return null;
  const port = settings?.smtpPort || Number(process.env.SMTP_PORT ?? 465);
  const user = settings?.smtpUser || process.env.SMTP_USER || null;
  const pass = settings?.smtpPass || process.env.SMTP_PASS || null;
  const from = settings?.mailFrom || process.env.MAIL_FROM || user;
  return { host, port, user, pass, from };
}

function getTransport(config: SmtpConfig) {
  const cacheKey = `${config.host}:${config.port}:${config.user}:${config.pass}`;
  if (!globalForMailer.cdriveMailer || globalForMailer.cdriveMailerKey !== cacheKey) {
    globalForMailer.cdriveMailer = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: config.user ? { user: config.user, pass: config.pass ?? undefined } : undefined,
    });
    globalForMailer.cdriveMailerKey = cacheKey;
  }
  return globalForMailer.cdriveMailer;
}

export async function sendMail(opts: { to: string; subject: string; text: string; html?: string }) {
  try {
    await sendMailOrThrow(opts);
  } catch (err) {
    console.error("[mailer] gönderilemedi:", opts.to, err);
  }
}

/**
 * `sendMail`'in hata fırlatan hali — SADECE admin panelindeki "Test e-postası gönder"
 * butonu gibi kullanıcının gerçek bir hata mesajı GÖRMESİ gereken tek bir yerde kullanılır.
 * Uygulamanın normal bildirim akışları her zaman sessiz `sendMail`'i kullanmaya devam eder.
 */
export async function sendMailOrThrow(opts: { to: string; subject: string; text: string; html?: string }) {
  const config = await getSmtpConfig();
  if (!config) throw new Error("SMTP yapılandırılmamış");
  const transport = getTransport(config);
  await transport.sendMail({
    from: config.from ?? undefined,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });
}

/**
 * E-postalardaki bağlantılar için mutlak site adresi (basePath dahil) — APP_URL
 * (production'da https://cdrive.calapverdi.tr) + NEXT_BASE_PATH (production'da boş,
 * yerelde/varsayılanda "/cdrive", next.config.ts'teki basePath ile aynı mantık).
 */
export function appBaseUrl() {
  const origin = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const basePath = process.env.NEXT_BASE_PATH ?? "/cdrive";
  return `${origin}${basePath}`;
}
