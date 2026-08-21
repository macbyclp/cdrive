/**
 * Cdrive'ın gönderdiği tüm e-postalar için tek, markalı HTML kabuk — restraint/sade
 * tasarım felsefesiyle uyumlu (gradyan/neon yok, tek vurgu rengi indigo #4f46e5,
 * uygulamanın kendi --accent'iyle aynı). E-posta istemcileri harici CSS/modern
 * CSS'in çoğunu desteklemediği için tablo tabanlı düzen + satır-içi stiller kullanılıyor
 * (bu, e-posta HTML'i için endüstri standardı bir kısıtlama, ihmal değil).
 */

const ACCENT = "#4f46e5";
const TEXT_PRIMARY = "#0f172a";
const TEXT_SECONDARY = "#475569";
const TEXT_TERTIARY = "#94a3b8";
const BORDER = "#e2e8f0";
const SURFACE_MUTED = "#f1f5f9";
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * @param heading Kısa başlık (örn. "Yeni sipariş")
 * @param bodyHtml Zaten güvenli/kaçışlı HTML gövde (paragraf(lar))
 * @param cta Opsiyonel eylem butonu — sipariş/sohbet gibi bir hedefe götürür
 */
export function renderEmail(opts: { heading: string; bodyHtml: string; cta?: { label: string; url: string }; orgName: string }) {
  const year = new Date().getFullYear();
  return `<!doctype html>
<html lang="tr">
  <body style="margin:0;padding:0;background:${SURFACE_MUTED};font-family:${FONT};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SURFACE_MUTED};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border:1px solid ${BORDER};border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 0 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="width:32px;height:32px;background:${ACCENT};border-radius:8px;text-align:center;vertical-align:middle;color:#ffffff;font-weight:700;font-size:16px;line-height:32px;">C</td>
                    <td style="padding-left:10px;color:${TEXT_PRIMARY};font-weight:600;font-size:15px;">Cdrive</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 8px 32px;">
                <h1 style="margin:0;font-size:19px;line-height:1.4;color:${TEXT_PRIMARY};font-weight:600;">${escapeHtml(opts.heading)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:4px 32px 8px 32px;font-size:14px;line-height:1.6;color:${TEXT_SECONDARY};">
                ${opts.bodyHtml}
              </td>
            </tr>
            ${
              opts.cta
                ? `<tr>
              <td style="padding:12px 32px 28px 32px;">
                <a href="${opts.cta.url}" style="display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 20px;border-radius:8px;">${escapeHtml(opts.cta.label)}</a>
              </td>
            </tr>`
                : `<tr><td style="padding-bottom:16px;"></td></tr>`
            }
            <tr>
              <td style="padding:16px 32px;border-top:1px solid ${BORDER};font-size:12px;color:${TEXT_TERTIARY};text-align:center;">
                © ${year} ${escapeHtml(opts.orgName)} — Tüm Hakları Saklıdır
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function paragraph(text: string) {
  return `<p style="margin:0 0 12px 0;">${escapeHtml(text)}</p>`;
}

/** Şifre sıfırlama e-postası — bağlantı 1 saat geçerli, tek kullanımlık. */
export function passwordResetEmail(opts: { name: string; resetUrl: string; orgName: string }) {
  const html = renderEmail({
    heading: "Şifre sıfırlama isteği",
    bodyHtml:
      paragraph(`Merhaba ${opts.name},`) +
      paragraph("Cdrive hesabın için bir şifre sıfırlama isteği aldık. Aşağıdaki butona tıklayarak yeni bir şifre belirleyebilirsin.") +
      paragraph("Bu bağlantı 1 saat geçerlidir ve sadece bir kez kullanılabilir. Bu isteği sen yapmadıysan bu e-postayı görmezden gelebilirsin — hesabında hiçbir şey değişmez."),
    cta: { label: "Yeni şifre belirle", url: opts.resetUrl },
    orgName: opts.orgName,
  });
  const text = `Merhaba ${opts.name},\n\nCdrive hesabın için bir şifre sıfırlama isteği aldık. Aşağıdaki bağlantıyla yeni bir şifre belirleyebilirsin (1 saat geçerli, tek kullanımlık):\n\n${opts.resetUrl}\n\nBu isteği sen yapmadıysan bu e-postayı görmezden gelebilirsin.`;
  return { subject: "Cdrive — Şifre sıfırlama", html, text };
}

/** notify.ts'in gönderdiği genel bildirim e-postaları için — mesaj tek satırlık düz metin, opsiyonel hedefe giden bir buton. */
export function genericNotificationEmail(opts: { heading: string; message: string; cta?: { label: string; url: string }; orgName: string }) {
  const html = renderEmail({ heading: opts.heading, bodyHtml: paragraph(opts.message), cta: opts.cta, orgName: opts.orgName });
  return { subject: `Cdrive — ${opts.heading}`, html, text: opts.message };
}
