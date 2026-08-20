import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canManageChatChannels } from "@/lib/access";
import { errorResponse } from "@/lib/api-helpers";

/** Kanal listesi — beta'da herkese açık, üyelik/görünürlük kısıtı yok. */
export async function GET() {
  try {
    await requireUser();
    const channels = await prisma.chatChannel.findMany({ orderBy: { name: "asc" } });
    return NextResponse.json(channels);
  } catch (err) {
    return errorResponse(err);
  }
}

const createSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Sadece küçük harf, rakam ve tire (-) kullanılabilir"),
});

/** Kanal oluşturma — spam'i önlemek için admin/departman yöneticisiyle sınırlı (bkz. canManageChatChannels). */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (!canManageChatChannels(user)) {
      return NextResponse.json({ error: "Kanal oluşturma yetkiniz yok" }, { status: 403 });
    }
    const body = createSchema.parse(await req.json());
    const existing = await prisma.chatChannel.findUnique({ where: { name: body.name } });
    if (existing) {
      return NextResponse.json({ error: "Bu isimde bir kanal zaten var" }, { status: 400 });
    }
    const channel = await prisma.chatChannel.create({
      data: { name: body.name, createdById: user.id },
    });
    return NextResponse.json(channel);
  } catch (err) {
    return errorResponse(err);
  }
}
