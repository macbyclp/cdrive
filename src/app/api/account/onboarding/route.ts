import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, hashPassword, createSession, computeTwoFactorRequired } from "@/lib/auth";
import { serializeAvatarConfig } from "@/lib/avatar-parts";
import { logAudit } from "@/lib/audit";
import { errorResponse, clientIp } from "@/lib/api-helpers";

const schema = z.object({
  password: z.string().min(8),
  avatarConfig: z.object({
    skin: z.string(),
    hairStyle: z.string(),
    hairColor: z.string(),
    eyes: z.string(),
    mouth: z.string(),
    accessory: z.string(),
  }),
});

/** İlk giriş kurulumu — admin tarafından açılan hesap kendi şifresini belirler ve bir avatar seçer. */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = schema.parse(await req.json());

    const passwordHash = await hashPassword(body.password);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, avatarParts: serializeAvatarConfig(body.avatarConfig), mustChangePassword: false },
    });

    await logAudit({ userId: user.id, action: "PASSWORD_CHANGE", detail: "İlk giriş kurulumu tamamlandı" });

    // JWT'deki eski mustChangePassword=true bayrağı yeni oturum açılana kadar geçerli
    // kalır — middleware'in hemen tekrar /onboarding'e atmaması için oturumu burada
    // güncel (false) bayrakla yeniden imzalıyoruz.
    const twoFactorRequired = await computeTwoFactorRequired({ role: user.role, twoFactorEnabled: user.twoFactorEnabled });
    await createSession(
      { userId: user.id, email: user.email, name: user.name, role: user.role, mustChangePassword: false, twoFactorRequired },
      { ip: clientIp(req), userAgent: req.headers.get("user-agent") }
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
