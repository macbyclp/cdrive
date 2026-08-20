import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canManageChatChannels } from "@/lib/access";
import { errorResponse } from "@/lib/api-helpers";

/** Kanal listesi — herkese açık kanallar + üyesi olduğu gizli kanallar. */
export async function GET() {
  try {
    const user = await requireUser();
    const channels = await prisma.chatChannel.findMany({
      where: { OR: [{ isPrivate: false }, { members: { some: { userId: user.id } } }] },
      orderBy: { name: "asc" },
    });
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
  isPrivate: z.boolean().optional(),
  memberIds: z.array(z.string()).max(200).optional(),
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
      data: { name: body.name, createdById: user.id, isPrivate: !!body.isPrivate },
    });

    if (body.isPrivate) {
      // Kanalı açan her zaman üye — dışarıdan davet edilen kullanıcılar + kendisi.
      const memberIds = new Set([user.id, ...(body.memberIds ?? [])]);
      await prisma.chatChannelMember.createMany({
        data: [...memberIds].map((userId) => ({ channelId: channel.id, userId })),
        skipDuplicates: true,
      });
    }

    return NextResponse.json(channel);
  } catch (err) {
    return errorResponse(err);
  }
}
