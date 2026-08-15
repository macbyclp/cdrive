import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canAccessFile, canAccessFolder } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { errorResponse } from "@/lib/api-helpers";

const schema = z.object({
  targetType: z.enum(["file", "folder"]),
  targetId: z.string(),
  userEmail: z.string().email(),
  permission: z.enum(["VIEW", "EDIT"]),
});

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);
    const targetType = searchParams.get("targetType");
    const targetId = searchParams.get("targetId");
    if ((targetType !== "file" && targetType !== "folder") || !targetId) {
      return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
    }
    const ok =
      targetType === "file"
        ? await canAccessFile(user, targetId, "VIEW")
        : await canAccessFolder(user, targetId, "VIEW");
    if (!ok) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });

    const grants =
      targetType === "file"
        ? await prisma.filePermission.findMany({ where: { fileId: targetId }, include: { user: { select: { id: true, name: true, email: true } } } })
        : await prisma.folderPermission.findMany({ where: { folderId: targetId }, include: { user: { select: { id: true, name: true, email: true } } } });
    return NextResponse.json(grants);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = schema.parse(await req.json());

    const ok =
      body.targetType === "file"
        ? await canAccessFile(user, body.targetId, "EDIT")
        : await canAccessFolder(user, body.targetId, "EDIT");
    if (!ok) return NextResponse.json({ error: "Bu öğeyi paylaşma izniniz yok" }, { status: 403 });

    const targetUser = await prisma.user.findUnique({ where: { email: body.userEmail.toLowerCase() } });
    if (!targetUser) return NextResponse.json({ error: "Kullanıcı bulunamadı" }, { status: 404 });

    const grant =
      body.targetType === "file"
        ? await prisma.filePermission.upsert({
            where: { fileId_userId: { fileId: body.targetId, userId: targetUser.id } },
            create: { fileId: body.targetId, userId: targetUser.id, permission: body.permission },
            update: { permission: body.permission },
          })
        : await prisma.folderPermission.upsert({
            where: { folderId_userId: { folderId: body.targetId, userId: targetUser.id } },
            create: { folderId: body.targetId, userId: targetUser.id, permission: body.permission },
            update: { permission: body.permission },
          });

    await logAudit({
      userId: user.id,
      action: "PERMISSION_GRANT",
      targetType: body.targetType,
      targetId: body.targetId,
      detail: `${targetUser.email} -> ${body.permission}`,
    });
    return NextResponse.json(grant);
  } catch (err) {
    return errorResponse(err);
  }
}

const deleteSchema = z.object({
  targetType: z.enum(["file", "folder"]),
  targetId: z.string(),
  userId: z.string(),
});

export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    const body = deleteSchema.parse(await req.json());
    const ok =
      body.targetType === "file"
        ? await canAccessFile(user, body.targetId, "EDIT")
        : await canAccessFolder(user, body.targetId, "EDIT");
    if (!ok) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });

    if (body.targetType === "file") {
      await prisma.filePermission.delete({
        where: { fileId_userId: { fileId: body.targetId, userId: body.userId } },
      });
    } else {
      await prisma.folderPermission.delete({
        where: { folderId_userId: { folderId: body.targetId, userId: body.userId } },
      });
    }
    await logAudit({ userId: user.id, action: "PERMISSION_REVOKE", targetType: body.targetType, targetId: body.targetId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
