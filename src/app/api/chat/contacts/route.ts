import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/api-helpers";
import { channelScopeKey, dmScopeKey } from "@/lib/chat";

/**
 * Sohbet kenar çubuğunun tek toplama noktası: kanallar (okunmamış rozetiyle),
 * daha önce mesajlaşılmış DM'ler (son mesaj önizlemesi + okunmamış rozetiyle,
 * en son etkinliğe göre sıralı) ve yeni bir DM başlatmak için tüm aktif
 * kullanıcı listesi.
 */
export async function GET() {
  try {
    const user = await requireUser();

    const [channels, readStates, dmMessages, allUsers] = await Promise.all([
      prisma.chatChannel.findMany({
        where: { OR: [{ isPrivate: false }, { members: { some: { userId: user.id } } }] },
        orderBy: { name: "asc" },
        include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } },
      }),
      prisma.chatReadState.findMany({ where: { userId: user.id } }),
      prisma.chatMessage.findMany({
        where: { OR: [{ senderId: user.id }, { recipientId: user.id }], channelId: null },
        orderBy: { createdAt: "desc" },
        include: { sender: { select: { id: true, name: true, avatarKey: true, avatarParts: true } } },
      }),
      prisma.user.findMany({
        where: { active: true, id: { not: user.id } },
        select: { id: true, name: true, avatarKey: true, avatarParts: true },
        orderBy: { name: "asc" },
      }),
    ]);

    const readMap = new Map(readStates.map((r) => [r.scopeKey, r.lastReadAt]));

    const channelList = channels.map((c) => {
      const lastMessage = c.messages[0] ?? null;
      const lastRead = readMap.get(channelScopeKey(c.id));
      const unread = !!lastMessage && (!lastRead || lastMessage.createdAt > lastRead);
      return {
        id: c.id,
        name: c.name,
        isPrivate: c.isPrivate,
        lastMessageAt: lastMessage?.createdAt ?? null,
        unread,
      };
    });

    // DM mesajları zaten en yeniden eskiye sıralı geldi — her partner için sadece
    // İLK (en yeni) mesajı tutarak konuşma listesini oluşturuyoruz.
    const dmMap = new Map<
      string,
      { userId: string; name: string; avatarKey: string | null; avatarParts: string | null; lastMessageAt: Date; preview: string; unread: boolean }
    >();
    for (const m of dmMessages) {
      const otherId = m.senderId === user.id ? m.recipientId! : m.senderId;
      if (dmMap.has(otherId)) continue;
      const lastRead = readMap.get(dmScopeKey(otherId));
      const unread = m.senderId !== user.id && (!lastRead || m.createdAt > lastRead);
      // Karşı taraf bilgisini (isim/avatar) mesajın sender'ından değil, gerekirse
      // allUsers'tan almak lazım (partner ben değilsem sender=partner zaten doğru;
      // ben gönderdiysem sender=ben, partner recipient — recipient'ın adını
      // biliyoruz çünkü allUsers listesinde var, ayrıca sorgulamaya gerek yok).
      const otherFromMessage = m.senderId === otherId ? m.sender : null;
      dmMap.set(otherId, {
        userId: otherId,
        name: otherFromMessage?.name ?? "",
        avatarKey: otherFromMessage?.avatarKey ?? null,
        avatarParts: otherFromMessage?.avatarParts ?? null,
        lastMessageAt: m.createdAt,
        preview: m.content.slice(0, 80),
        unread,
      });
    }
    // Ben gönderdiğim (recipient bilgisi mesajda gömülü değil) konuşmalar için
    // isim/avatar'ı allUsers listesinden tamamla.
    const usersById = new Map(allUsers.map((u) => [u.id, u]));
    const dmList = [...dmMap.values()]
      .map((d) => {
        if (d.name) return d;
        const u = usersById.get(d.userId);
        return { ...d, name: u?.name ?? "Bilinmeyen kullanıcı", avatarKey: u?.avatarKey ?? null, avatarParts: u?.avatarParts ?? null };
      })
      .sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());

    return NextResponse.json({ channels: channelList, dms: dmList, allUsers });
  } catch (err) {
    return errorResponse(err);
  }
}
