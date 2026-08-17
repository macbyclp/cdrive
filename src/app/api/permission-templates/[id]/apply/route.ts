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
});

/** Bir izin şablonunu bir dosya/klasöre uygular — şablondaki tüm kullanıcı + grup üyelerine izin verir. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = schema.parse(await req.json());

    const ok =
      body.targetType === "file"
        ? await canAccessFile(user, body.targetId, "EDIT")
        : await canAccessFolder(user, body.targetId, "EDIT");
    if (!ok) return NextResponse.json({ error: "Bu öğeyi paylaşma izniniz yok" }, { status: 403 });

    const template = await prisma.permissionTemplate.findUnique({
      where: { id },
      include: { members: { include: { group: { include: { members: true } } } } },
    });
    if (!template) return NextResponse.json({ error: "Şablon bulunamadı" }, { status: 404 });

    const userIds = new Set<string>();
    for (const m of template.members) {
      if (m.userId) userIds.add(m.userId);
      if (m.group) for (const gm of m.group.members) userIds.add(gm.userId);
    }

    let applied = 0;
    for (const targetUserId of userIds) {
      if (body.targetType === "file") {
        await prisma.filePermission.upsert({
          where: { fileId_userId: { fileId: body.targetId, userId: targetUserId } },
          create: { fileId: body.targetId, userId: targetUserId, permission: template.permission },
          update: { permission: template.permission },
        });
      } else {
        await prisma.folderPermission.upsert({
          where: { folderId_userId: { folderId: body.targetId, userId: targetUserId } },
          create: { folderId: body.targetId, userId: targetUserId, permission: template.permission },
          update: { permission: template.permission },
        });
      }
      applied++;
    }

    await logAudit({
      userId: user.id,
      action: "PERMISSION_GRANT",
      targetType: body.targetType,
      targetId: body.targetId,
      detail: `Şablon uygulandı: "${template.name}" (${applied} kullanıcı)`,
    });

    return NextResponse.json({ applied });
  } catch (err) {
    return errorResponse(err);
  }
}
