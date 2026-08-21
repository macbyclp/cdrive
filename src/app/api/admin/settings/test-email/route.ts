import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { errorResponse } from "@/lib/api-helpers";
import { getSmtpConfig, sendMailOrThrow, appBaseUrl } from "@/lib/mailer";
import { genericNotificationEmail } from "@/lib/email-templates";
import { getOrgName } from "@/lib/org";

const schema = z.object({ to: z.string().email() });

/** Admin panelinden "Test e-postası gönder" — SSH'a gerek kalmadan SMTP ayarlarının gerçekten çalıştığını doğrular. */
export async function POST(req: Request) {
  try {
    const admin = await requireRole("ADMIN");
    const { to } = schema.parse(await req.json());

    const config = await getSmtpConfig();
    if (!config) {
      return NextResponse.json({ error: "SMTP ayarları henüz kaydedilmemiş — önce host/kullanıcı/şifre girip kaydedin." }, { status: 400 });
    }

    const orgName = await getOrgName();
    const { subject, html, text } = genericNotificationEmail({
      heading: "Test e-postası",
      message: `Bu, ${admin.name} tarafından Cdrive admin panelinden gönderilen bir test e-postasıdır. Bu mesajı görüyorsan SMTP ayarların doğru çalışıyor.`,
      cta: { label: "Cdrive'ı aç", url: appBaseUrl() },
      orgName,
    });
    try {
      await sendMailOrThrow({ to, subject, html, text });
    } catch (mailErr) {
      const detail = mailErr instanceof Error ? mailErr.message : String(mailErr);
      return NextResponse.json({ error: `Gönderilemedi: ${detail}` }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
