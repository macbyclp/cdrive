import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { serializeAvatarConfig } from "@/lib/avatar-parts";
import { errorResponse } from "@/lib/api-helpers";

const schema = z.object({
  skin: z.string(),
  hairStyle: z.string(),
  hairColor: z.string(),
  eyes: z.string(),
  mouth: z.string(),
  accessory: z.string(),
});

/** Kullanıcının kendi avatarını istediği zaman değiştirmesi — onboarding'e özel değil. */
export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    const config = schema.parse(await req.json());
    await prisma.user.update({ where: { id: user.id }, data: { avatarParts: serializeAvatarConfig(config) } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
