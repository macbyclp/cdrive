import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canAccessFile, canAccessChatChannel } from "@/lib/access";
import { errorResponse } from "@/lib/api-helpers";
import { publishChatMessage } from "@/lib/chat-events";
import { chatPreview } from "@/lib/chat";

const senderSelect = { select: { id: true, name: true, avatarKey: true, avatarParts: true } } as const;
const fileSelect = { select: { id: true, name: true, mimeType: true, size: true } } as const;

function serialize(m: {
  id: string;
  content: string;
  createdAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
  senderId: string;
  channelId: string | null;
  recipientId: string | null;
  sender: { id: string; name: string; avatarKey: string | null; avatarParts: string | null };
  file: { id: string; name: string; mimeType: string; size: bigint } | null;
}) {
  const deleted = !!m.deletedAt;
  return {
    id: m.id,
    content: deleted ? "" : m.content,
    createdAt: m.createdAt.toISOString(),
    editedAt: m.editedAt ? m.editedAt.toISOString() : null,
    deleted,
    channelId: m.channelId,
    recipientId: m.recipientId,
    sender: m.sender,
    file: deleted ? null : m.file ? { ...m.file, size: m.file.size.toString() } : null,
  };
}

/**
 * Geçmiş mesajlar — ?channelId=X (herkese açık YA DA gizli kanal — gizliyse üyelik
 * şart, bkz. canAccessChatChannel) YA DA ?dmUserId=Y (birebir konuşma). DM sorgusu
 * bilerek "senderId=ben && recipientId=Y" OR "senderId=Y && recipientId=ben" şeklinde
 * kuruluyor — istemcinin verdiği bir "conversationId" değil, HER ZAMAN oturumdaki
 * kullanıcıdan türetilen bir filtre; başka birinin DM'ini id tahmin ederek okuma
 * (IDOR) böylece yapısal olarak imkansız.
 */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);
    const channelId = searchParams.get("channelId");
    const dmUserId = searchParams.get("dmUserId");
    if (!channelId && !dmUserId) {
      return NextResponse.json({ error: "channelId veya dmUserId gerekli" }, { status: 400 });
    }

    if (channelId) {
      const ok = await canAccessChatChannel(user, channelId);
      if (!ok) return NextResponse.json({ error: "Bu kanala erişiminiz yok" }, { status: 403 });
    }

    const where = channelId
      ? { channelId }
      : {
          OR: [
            { senderId: user.id, recipientId: dmUserId! },
            { senderId: dmUserId!, recipientId: user.id },
          ],
        };

    const messages = await prisma.chatMessage.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { sender: senderSelect, file: fileSelect },
    });

    return NextResponse.json(messages.reverse().map(serialize));
  } catch (err) {
    return errorResponse(err);
  }
}

const sendSchema = z
  .object({
    content: z.string().trim().max(4000).optional(),
    channelId: z.string().optional(),
    recipientId: z.string().optional(),
    fileId: z.string().optional(),
    mentionedUserIds: z.array(z.string()).max(20).optional(),
  })
  .refine((d) => !!d.channelId !== !!d.recipientId, {
    message: "channelId ve recipientId'den tam olarak biri verilmeli",
  })
  .refine((d) => !!(d.content && d.content.length > 0) || !!d.fileId, {
    message: "Mesaj metni veya ekli dosyadan en az biri gerekli",
  });

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = sendSchema.parse(await req.json());

    let channel: { id: string; isPrivate: boolean } | null = null;
    if (body.channelId) {
      channel = await prisma.chatChannel.findUnique({ where: { id: body.channelId }, select: { id: true, isPrivate: true } });
      if (!channel) return NextResponse.json({ error: "Kanal bulunamadı" }, { status: 404 });
      const ok = await canAccessChatChannel(user, body.channelId);
      if (!ok) return NextResponse.json({ error: "Bu kanala erişiminiz yok" }, { status: 403 });
    } else {
      // Kendine DM atmayı ve pasif/silinmiş bir kullanıcıya mesaj göndermeyi engelle.
      if (body.recipientId === user.id) {
        return NextResponse.json({ error: "Kendinize mesaj gönderemezsiniz" }, { status: 400 });
      }
      const recipient = await prisma.user.findUnique({ where: { id: body.recipientId! } });
      if (!recipient || !recipient.active) {
        return NextResponse.json({ error: "Alıcı bulunamadı" }, { status: 404 });
      }
    }

    if (body.fileId) {
      // Göndereni görmediği bir dosyayı id tahmin ederek eklemesin — ekledikten sonra
      // (kanalsa herkese, DM'se karşı tarafa) görünür/indirilebilir hale gelecek, bu
      // yüzden "paylaşma" niyeti burada doğrulanıyor (bkz. GET /api/files/[id]'deki
      // sohbet-üzerinden-erişim istisnası).
      const ok = await canAccessFile(user, body.fileId, "VIEW");
      if (!ok) return NextResponse.json({ error: "Eklemek istediğiniz dosyaya erişiminiz yok" }, { status: 403 });
    }

    const message = await prisma.chatMessage.create({
      data: {
        content: body.content ?? "",
        senderId: user.id,
        channelId: body.channelId ?? null,
        recipientId: body.recipientId ?? null,
        fileId: body.fileId ?? null,
      },
      include: { sender: senderSelect, file: fileSelect },
    });

    let channelMemberIds: string[] | null = null;
    if (channel?.isPrivate) {
      const members = await prisma.chatChannelMember.findMany({ where: { channelId: channel.id }, select: { userId: true } });
      channelMemberIds = members.map((m) => m.userId);
    }

    const serialized = serialize(message);
    publishChatMessage({
      id: serialized.id,
      content: serialized.content,
      createdAt: serialized.createdAt,
      senderId: message.senderId,
      senderName: message.sender.name,
      senderAvatarKey: message.sender.avatarKey,
      senderAvatarParts: message.sender.avatarParts,
      channelId: message.channelId,
      recipientId: message.recipientId,
      file: serialized.file,
      channelPrivate: !!channel?.isPrivate,
      channelMemberIds,
    });

    // Bildirimler: DM'de karşı tarafa her zaman, kanalda sadece @bahsedilen kullanıcılara
    // (kanal üyeliği yok/geniş olabileceğinden her mesajda herkese bildirim spam olurdu).
    const preview = chatPreview(body.content || (body.fileId ? "📎 Dosya eki" : ""));
    if (body.recipientId) {
      await prisma.notification.create({
        data: {
          userId: body.recipientId,
          type: "CHAT_DM",
          message: `${message.sender.name}: ${preview}`,
          targetType: "chat_dm",
          targetId: message.senderId,
        },
      });
    } else if (body.mentionedUserIds && body.mentionedUserIds.length > 0) {
      const uniqueIds = [...new Set(body.mentionedUserIds)].filter((id) => id !== user.id);
      // Gizli kanalda sadece gerçek üyeler bahsedilebilir/bildirim alabilir.
      const eligibleIds = channelMemberIds ? uniqueIds.filter((id) => channelMemberIds!.includes(id)) : uniqueIds;
      for (const targetId of eligibleIds) {
        await prisma.notification.create({
          data: {
            userId: targetId,
            type: "CHAT_MENTION",
            message: `${message.sender.name} seni bir kanalda bahsetti: ${preview}`,
            targetType: "chat_channel",
            targetId: message.channelId,
          },
        });
      }
    }

    return NextResponse.json(serialized);
  } catch (err) {
    return errorResponse(err);
  }
}
