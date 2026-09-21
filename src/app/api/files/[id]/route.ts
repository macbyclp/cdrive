import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canAccessFile, canAccessFolder, canAccessChatChannel } from "@/lib/access";
import { serveStoredFile } from "@/lib/http-range";
import { logAudit } from "@/lib/audit";
import { lockUser, adjustUsedBytes, versionBytesByOwner } from "@/lib/quota";
import { errorResponse } from "@/lib/api-helpers";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    let ok = await canAccessFile(user, id, "VIEW");
    if (!ok) {
      // Dosyanın kendisinde klasör/paylaşım izni olmasa bile, sohbette görebildiği bir
      // mesaja EKLİ ise indirebilmeli — kanal mesajı herkese açık, DM ise sadece
      // gönderen/alıcıya. "Sohbete ekleme" fiilen "bu görünürlükte paylaşma" anlamına
      // geliyor (gerçek kurum-içi sohbet uygulamalarındaki gibi).
      const msgs = await prisma.chatMessage.findMany({
        where: {
          fileId: id,
          OR: [{ channelId: { not: null } }, { senderId: user.id }, { recipientId: user.id }],
        },
        select: { channelId: true, senderId: true, recipientId: true },
      });
      ok = false;
      const checked = new Set<string>();
      for (const m of msgs) {
        if (m.channelId) {
          // Gizli kanalda yalnızca üyeler; herkese açık kanalda herkes.
          if (checked.has(m.channelId)) continue;
          checked.add(m.channelId);
          if (await canAccessChatChannel(user, m.channelId)) {
            ok = true;
            break;
          }
        } else if (m.senderId === user.id || m.recipientId === user.id) {
          ok = true;
          break;
        }
      }
    }
    if (!ok) return NextResponse.json({ error: "Bu dosyaya erişiminiz yok" }, { status: 403 });

    const file = await prisma.file.findUnique({ where: { id }, include: { currentVersion: true } });
    if (!file || file.deletedAt || !file.currentVersion) {
      return NextResponse.json({ error: "Dosya bulunamadı" }, { status: 404 });
    }

    // ?meta=1 — dosyanın İÇERİĞİNİ değil sadece künyesini döner. Onay bildiriminden
    // gelen derin bağlantı (/drive?approval=<fileId>) dosyanın adını göstermek için
    // bunu kullanıyor; dosya o kullanıcının listesinde olmayabilir. İçerik
    // okunmadığı için denetim günlüğüne indirme kaydı da DÜŞMEZ.
    if (new URL(req.url).searchParams.get("meta") === "1") {
      return NextResponse.json({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size.toString(),
        ownerId: file.ownerId,
        folderId: file.folderId,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
      });
    }

    const inline = new URL(req.url).searchParams.get("inline") === "1";
    // Önizleme (inline) isteklerini denetim günlüğüne indirme olarak yazmıyoruz;
    // dosyayı gerçekten indirmek ayrı bir kayıt oluşturur.
    // Range devam istekleri (video ileri sarma) her seferinde indirme sayılmasın: yalnız başlangıç isteği loglanır.
    const rangeHeader = req.headers.get("range");
    const isContinuation = !!rangeHeader && !/^bytes=0-/.test(rangeHeader);
    if (!inline && !isContinuation) {
      await logAudit({ userId: user.id, action: "DOWNLOAD", targetType: "file", targetId: file.id, detail: file.name });
    }

    // Akışlı yanıt + HTTP Range (206): tarayıcı içi video/ses ileri sarma ve büyük dosyalarda sabit bellek.
    return serveStoredFile(req, {
      storageKey: file.currentVersion.storageKey,
      contentType: file.mimeType || "application/octet-stream",
      headers: {
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(file.name)}"`,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

const patchSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  folderId: z.string().nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const ok = await canAccessFile(user, id, "EDIT");
    if (!ok) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });

    const body = patchSchema.parse(await req.json());
    if (body.folderId !== undefined && body.folderId !== null) {
      const destOk = await canAccessFolder(user, body.folderId, "EDIT");
      if (!destOk) return NextResponse.json({ error: "Hedef klasörde yetkiniz yok" }, { status: 403 });
    }

    const file = await prisma.file.update({ where: { id }, data: body });
    await logAudit({
      userId: user.id,
      action: body.folderId !== undefined ? "MOVE" : "RENAME",
      targetType: "file",
      targetId: id,
      detail: file.name,
    });
    return NextResponse.json({ ...file, size: file.size.toString(), searchText: undefined });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const ok = await canAccessFile(user, id, "EDIT");
    if (!ok) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });

    const file = await prisma.file.findUnique({ where: { id } });
    if (!file) return NextResponse.json({ error: "Dosya bulunamadı" }, { status: 404 });

    if (file.deletedAt) return NextResponse.json({ ok: true }); // zaten çöp kutusunda: kota iki kez düşülmesin
    await prisma.$transaction(async (tx) => {
      const freed = await versionBytesByOwner(tx, [file]);
      await tx.file.update({ where: { id }, data: { deletedAt: new Date() } });
      await lockUser(tx, file.ownerId);
      await adjustUsedBytes(tx, file.ownerId, -(freed.get(file.ownerId) ?? 0n)); // tüm sürümler serbest kalır
    });

    await logAudit({ userId: user.id, action: "DELETE", targetType: "file", targetId: id, detail: file.name });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
