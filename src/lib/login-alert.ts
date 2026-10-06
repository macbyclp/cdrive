// Yeni cihazdan giriş uyarısı: hesaba daha önce görülmemiş bir tarayıcı/işletim sistemi
// kombinasyonuyla girilirse hesap sahibine e-posta gider (çalınan parola/oturum erken fark edilsin).
import { prisma } from "@/lib/prisma";
import { sendMail, appBaseUrl } from "@/lib/mailer";
import { newDeviceLoginEmail } from "@/lib/email-templates";
import { getOrgName } from "@/lib/org";

/**
 * User-Agent'tan kaba "Tarayıcı · İşletim sistemi" etiketi. Sürüm numarası bilerek etikete girmez:
 * tarayıcı her güncellendiğinde "yeni cihaz" uyarısı gelmesin.
 */
export function deviceLabel(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  if (!ua) return "Bilinmeyen cihaz";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\/|CriOS\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : /curl\//i.test(ua)
              ? "curl"
              : "Tarayıcı";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad|iPod/.test(ua)
        ? "iOS"
        : /Macintosh|Mac OS X/.test(ua)
          ? "macOS"
          : /CrOS/.test(ua)
            ? "ChromeOS"
            : /Linux/.test(ua)
              ? "Linux"
              : "Bilinmeyen sistem";
  return `${browser} · ${os}`;
}

const HISTORY_LOOKBACK = 100;

/**
 * Yeni açılan oturumun cihazı, kullanıcının önceki oturumlarında yoksa uyarı e-postası yollar.
 * Hesabın İLK girişi uyarı üretmez. Hiçbir hata girişi bozmaz (e-posta yan etkidir).
 */
export async function notifyNewDeviceLogin(
  user: { id: string; name: string; email: string },
  sessionId: string,
  meta: { ip: string | null; userAgent: string | null }
): Promise<boolean> {
  try {
    const previous = await prisma.session.findMany({
      where: { userId: user.id, id: { not: sessionId } },
      select: { userAgent: true },
      orderBy: { createdAt: "desc" },
      take: HISTORY_LOOKBACK,
    });
    if (previous.length === 0) return false;
    const current = deviceLabel(meta.userAgent);
    if (previous.some((p) => deviceLabel(p.userAgent) === current)) return false;

    const orgName = await getOrgName();
    const { subject, html, text } = newDeviceLoginEmail({
      name: user.name,
      device: current,
      ip: meta.ip,
      when: new Date().toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" }),
      accountUrl: `${appBaseUrl()}/account`,
      orgName,
    });
    await sendMail({ to: user.email, subject, html, text });
    return true;
  } catch (e) {
    console.error("[login-alert] yeni cihaz uyarısı gönderilemedi:", e);
    return false;
  }
}
