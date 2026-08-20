import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/api-helpers";
import { publishChatMessage } from "@/lib/chat-events";

const senderSelect = { select: { id: true, name: true, avatarKey: true, avatarParts: true } } as const;

function serialize(m: {
  id: string;
  content: string;
  createdAt: Date;
  senderId: string;
  channelId: string | null;
  recipientId: string | null;
  sender: { id: string; name: string; avatarKey: string | null; avatarParts: string | null };
}) {
  return {
    id: m.id,
    content: m.content,
    createdAt: m.createdAt.toISOString(),
    channelId: m.channelId,
    recipientId: m.recipientId,
    sender: m.sender,
  };
}

/**
 * Geçmiş mesajlar — ?channelId=X (herkese açık kanal) YA DA ?dmUserId=Y
 * (birebir konuşma). DM sorgusu bilerek "senderId=ben && recipientId=Y" OR
 * "senderId=Y && recipientId=ben" şeklinde kuruluyor — istemcinin verdiği bir
 * "conversationId" değil, HER ZAMAN oturumdaki kullanıcıdan türetilen bir
 * filtre; başka birinin DM'ini id tahmin ederek okuma (IDOR) böylece yapısal
 * olarak imkansız.
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
      include: { sender: senderSelect },
    });

    return NextResponse.json(messages.reverse().map(serialize));
  } catch (err) {
    return errorResponse(err);
  }
}

const sendSchema = z
  .object({
    content: z.string().trim().min(1).max(4000),
    channelId: z.string().optional(),
    recipientId: z.string().optional(),
  })
  .refine((d) => !!d.channelId !== !!d.recipientId, {
    message: "channelId ve recipientId'den tam olarak biri verilmeli",
  });

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = sendSchema.parse(await req.json());

    if (body.channelId) {
      const channel = await prisma.chatChannel.findUnique({ where: { id: body.channelId } });
      if (!channel) return NextResponse.json({ error: "Kanal bulunamadı" }, { status: 404 });
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

    const message = await prisma.chatMessage.create({
      data: {
        content: body.content,
        senderId: user.id,
        channelId: body.channelId ?? null,
        recipientId: body.recipientId ?? null,
      },
      include: { sender: senderSelect },
    });

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
    });

    return NextResponse.json(serialized);
  } catch (err) {
    return errorResponse(err);
  }
}
