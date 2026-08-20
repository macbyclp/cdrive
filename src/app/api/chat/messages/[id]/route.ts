import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/api-helpers";
import { publishChatEvent } from "@/lib/chat-events";

const editSchema = z.object({ content: z.string().trim().min(1).max(4000) });

async function loadOwnMessage(id: string, userId: string) {
  const message = await prisma.chatMessage.findUnique({
    where: { id },
    include: { sender: { select: { id: true, name: true, avatarKey: true, avatarParts: true } } },
  });
  if (!message || message.deletedAt) return null;
  if (message.senderId !== userId) return "forbidden" as const;
  return message;
}

/** Mesaj düzenleme — sadece göndereni düzenleyebilir, dosya-eki-sadece mesajlar (content'i olmayan) düzenlenemez. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = editSchema.parse(await req.json());

    const existing = await loadOwnMessage(id, user.id);
    if (existing === null) return NextResponse.json({ error: "Mesaj bulunamadı" }, { status: 404 });
    if (existing === "forbidden") return NextResponse.json({ error: "Sadece kendi mesajınızı düzenleyebilirsiniz" }, { status: 403 });

    let channelMemberIds: string[] | null = null;
    let channelPrivate = false;
    if (existing.channelId) {
      const channel = await prisma.chatChannel.findUnique({ where: { id: existing.channelId }, select: { isPrivate: true } });
      channelPrivate = !!channel?.isPrivate;
      if (channelPrivate) {
        const members = await prisma.chatChannelMember.findMany({ where: { channelId: existing.channelId }, select: { userId: true } });
        channelMemberIds = members.map((m) => m.userId);
      }
    }

    const updated = await prisma.chatMessage.update({
      where: { id },
      data: { content: body.content, editedAt: new Date() },
    });

    publishChatEvent({
      kind: "edit",
      id: updated.id,
      content: updated.content,
      createdAt: existing.createdAt.toISOString(),
      editedAt: updated.editedAt!.toISOString(),
      senderId: existing.senderId,
      senderName: existing.sender.name,
      senderAvatarKey: existing.sender.avatarKey,
      senderAvatarParts: existing.sender.avatarParts,
      channelId: existing.channelId,
      recipientId: existing.recipientId,
      file: null,
      channelPrivate,
      channelMemberIds,
    });

    return NextResponse.json({ id: updated.id, content: updated.content, editedAt: updated.editedAt!.toISOString() });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Mesaj silme (yumuşak) — sadece gönderen silebilir. İçerik boşaltılır, satır kalır (SSE/okundu bütünlüğü için). */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const existing = await loadOwnMessage(id, user.id);
    if (existing === null) return NextResponse.json({ error: "Mesaj bulunamadı" }, { status: 404 });
    if (existing === "forbidden") return NextResponse.json({ error: "Sadece kendi mesajınızı silebilirsiniz" }, { status: 403 });

    let channelMemberIds: string[] | null = null;
    let channelPrivate = false;
    if (existing.channelId) {
      const channel = await prisma.chatChannel.findUnique({ where: { id: existing.channelId }, select: { isPrivate: true } });
      channelPrivate = !!channel?.isPrivate;
      if (channelPrivate) {
        const members = await prisma.chatChannelMember.findMany({ where: { channelId: existing.channelId }, select: { userId: true } });
        channelMemberIds = members.map((m) => m.userId);
      }
    }

    await prisma.chatMessage.update({ where: { id }, data: { deletedAt: new Date(), fileId: null } });

    publishChatEvent({
      kind: "delete",
      id,
      content: "",
      createdAt: existing.createdAt.toISOString(),
      editedAt: null,
      senderId: existing.senderId,
      senderName: existing.sender.name,
      senderAvatarKey: existing.sender.avatarKey,
      senderAvatarParts: existing.sender.avatarParts,
      channelId: existing.channelId,
      recipientId: existing.recipientId,
      file: null,
      channelPrivate,
      channelMemberIds,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
