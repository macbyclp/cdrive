import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canAccessFile, canAccessFolder } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { errorResponse } from "@/lib/api-helpers";

export async function GET() {
  try {
    const user = await requireUser();
    const [fileStars, folderStars] = await Promise.all([
      prisma.fileStar.findMany({
        where: { userId: user.id, file: { deletedAt: null } },
        include: { file: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.folderStar.findMany({
        where: { userId: user.id, folder: { deletedAt: null } },
        include: { folder: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    return NextResponse.json({
      files: fileStars.map((s) => ({ ...s.file, size: s.file.size.toString() })),
      folders: folderStars.map((s) => s.folder),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

const schema = z.object({
  targetType: z.enum(["file", "folder"]),
  targetId: z.string(),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = schema.parse(await req.json());

    const ok =
      body.targetType === "file"
        ? await canAccessFile(user, body.targetId, "VIEW")
        : await canAccessFolder(user, body.targetId, "VIEW");
    if (!ok) return NextResponse.json({ error: "Bu öğeye erişiminiz yok" }, { status: 403 });

    if (body.targetType === "file") {
      await prisma.fileStar.upsert({
        where: { userId_fileId: { userId: user.id, fileId: body.targetId } },
        create: { userId: user.id, fileId: body.targetId },
        update: {},
      });
    } else {
      await prisma.folderStar.upsert({
        where: { userId_folderId: { userId: user.id, folderId: body.targetId } },
        create: { userId: user.id, folderId: body.targetId },
        update: {},
      });
    }
    await logAudit({ userId: user.id, action: "STAR", targetType: body.targetType, targetId: body.targetId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    const body = schema.parse(await req.json());

    if (body.targetType === "file") {
      await prisma.fileStar.deleteMany({ where: { userId: user.id, fileId: body.targetId } });
    } else {
      await prisma.folderStar.deleteMany({ where: { userId: user.id, folderId: body.targetId } });
    }
    await logAudit({ userId: user.id, action: "UNSTAR", targetType: body.targetType, targetId: body.targetId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
