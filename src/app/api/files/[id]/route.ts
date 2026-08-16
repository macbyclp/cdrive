import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canAccessFile, canAccessFolder } from "@/lib/access";
import { readFile } from "@/lib/storage";
import { logAudit } from "@/lib/audit";
import { errorResponse } from "@/lib/api-helpers";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const ok = await canAccessFile(user, id, "VIEW");
    if (!ok) return NextResponse.json({ error: "Bu dosyaya erişiminiz yok" }, { status: 403 });

    const file = await prisma.file.findUnique({ where: { id }, include: { currentVersion: true } });
    if (!file || file.deletedAt || !file.currentVersion) {
      return NextResponse.json({ error: "Dosya bulunamadı" }, { status: 404 });
    }

    const buffer = await readFile(file.currentVersion.storageKey);
    const inline = new URL(req.url).searchParams.get("inline") === "1";
    // Önizleme (inline) isteklerini denetim günlüğüne indirme olarak yazmıyoruz;
    // dosyayı gerçekten indirmek ayrı bir kayıt oluşturur.
    if (!inline) {
      await logAudit({ userId: user.id, action: "DOWNLOAD", targetType: "file", targetId: file.id, detail: file.name });
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": file.mimeType || "application/octet-stream",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(file.name)}"`,
        "Content-Length": String(buffer.byteLength),
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

    await prisma.file.update({ where: { id }, data: { deletedAt: new Date() } });
    await prisma.user.update({
      where: { id: file.ownerId },
      data: { usedBytes: { decrement: file.size } },
    });

    await logAudit({ userId: user.id, action: "DELETE", targetType: "file", targetId: id, detail: file.name });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
