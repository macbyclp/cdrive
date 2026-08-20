import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/api-helpers";

/**
 * Sohbet içi arama — kullanıcının erişebildiği TÜM konuşmalar (herkese açık kanallar +
 * üyesi olduğu gizli kanallar + kendi DM'leri) içinde metin arar. Silinmiş mesajlar hariç.
 * Kapsam istemciden alınmıyor (IDOR yok) — her zaman oturumdaki kullanıcıdan türetiliyor.
 */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const q = new URL(req.url).searchParams.get("q")?.trim();
    if (!q || q.length < 2) return NextResponse.json({ results: [] });

    const accessibleChannels = await prisma.chatChannel.findMany({
      where: { OR: [{ isPrivate: false }, { members: { some: { userId: user.id } } }] },
      select: { id: true, name: true },
    });
    const channelIds = accessibleChannels.map((c) => c.id);
    const channelNameById = new Map(accessibleChannels.map((c) => [c.id, c.name]));

    const messages = await prisma.chatMessage.findMany({
      where: {
        deletedAt: null,
        content: { contains: q },
        OR: [
          { channelId: { in: channelIds } },
          { senderId: user.id, channelId: null },
          { recipientId: user.id, channelId: null },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { sender: { select: { id: true, name: true } } },
    });

    const results = messages.map((m) => ({
      id: m.id,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
      senderName: m.sender.name,
      channelId: m.channelId,
      channelName: m.channelId ? channelNameById.get(m.channelId) ?? null : null,
      dmUserId: m.channelId ? null : m.senderId === user.id ? m.recipientId : m.senderId,
    }));

    return NextResponse.json({ results });
  } catch (err) {
    return errorResponse(err);
  }
}
