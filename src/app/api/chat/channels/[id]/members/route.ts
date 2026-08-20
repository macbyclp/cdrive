import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canManageChatChannels } from "@/lib/access";
import { errorResponse } from "@/lib/api-helpers";

/** Bir gizli kanalın üye listesi — sadece o kanalın üyeleri görebilir (herkese açık kanallarda anlamsız, boş döner). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const channel = await prisma.chatChannel.findUnique({ where: { id }, select: { isPrivate: true } });
    if (!channel) return NextResponse.json({ error: "Kanal bulunamadı" }, { status: 404 });
    if (!channel.isPrivate) return NextResponse.json({ members: [] });

    const membership = await prisma.chatChannelMember.findUnique({ where: { channelId_userId: { channelId: id, userId: user.id } } });
    if (!membership) return NextResponse.json({ error: "Bu kanala erişiminiz yok" }, { status: 403 });

    const members = await prisma.chatChannelMember.findMany({
      where: { channelId: id },
      include: { user: { select: { id: true, name: true, avatarKey: true, avatarParts: true } } },
    });
    return NextResponse.json({ members: members.map((m) => m.user) });
  } catch (err) {
    return errorResponse(err);
  }
}

const addSchema = z.object({ userIds: z.array(z.string()).min(1).max(50) });

/** Gizli kanala üye ekleme — spam'i önlemek için kanal açma yetkisiyle aynı kısıtta (admin/departman yöneticisi). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!canManageChatChannels(user)) {
      return NextResponse.json({ error: "Üye ekleme yetkiniz yok" }, { status: 403 });
    }
    const { id } = await params;
    const channel = await prisma.chatChannel.findUnique({ where: { id }, select: { isPrivate: true } });
    if (!channel) return NextResponse.json({ error: "Kanal bulunamadı" }, { status: 404 });
    if (!channel.isPrivate) return NextResponse.json({ error: "Herkese açık kanalda üyelik yönetilmez" }, { status: 400 });

    const body = addSchema.parse(await req.json());
    await prisma.chatChannelMember.createMany({
      data: body.userIds.map((userId) => ({ channelId: id, userId })),
      skipDuplicates: true,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
