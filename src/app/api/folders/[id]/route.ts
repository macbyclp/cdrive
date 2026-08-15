import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canAccessFolder } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { errorResponse } from "@/lib/api-helpers";
import { softDeleteFolderRecursive } from "@/lib/trash";

const patchSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  parentId: z.string().nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const ok = await canAccessFolder(user, id, "EDIT");
    if (!ok) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });

    const body = patchSchema.parse(await req.json());

    if (body.parentId !== undefined && body.parentId !== null) {
      if (body.parentId === id) {
        return NextResponse.json({ error: "Bir klasör kendi içine taşınamaz" }, { status: 400 });
      }
      const destOk = await canAccessFolder(user, body.parentId, "EDIT");
      if (!destOk) return NextResponse.json({ error: "Hedef klasörde yetkiniz yok" }, { status: 403 });
      if (await isDescendant(id, body.parentId)) {
        return NextResponse.json({ error: "Bir klasör kendi alt klasörüne taşınamaz" }, { status: 400 });
      }
    }

    const folder = await prisma.folder.update({
      where: { id },
      data: { name: body.name, parentId: body.parentId },
    });

    await logAudit({
      userId: user.id,
      action: body.parentId !== undefined ? "MOVE" : "RENAME",
      targetType: "folder",
      targetId: id,
      detail: folder.name,
    });
    return NextResponse.json(folder);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const ok = await canAccessFolder(user, id, "EDIT");
    if (!ok) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });

    await softDeleteFolderRecursive(id);
    await logAudit({ userId: user.id, action: "DELETE", targetType: "folder", targetId: id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

/** candidateParentId, folderId'nin kendisi ya da bir alt soyu mu (döngü koruması)? */
async function isDescendant(folderId: string, candidateParentId: string): Promise<boolean> {
  let current: { id: string; parentId: string | null } | null = await prisma.folder.findUnique({
    where: { id: candidateParentId },
    select: { id: true, parentId: true },
  });
  while (current) {
    if (current.id === folderId) return true;
    current = current.parentId
      ? await prisma.folder.findUnique({ where: { id: current.parentId }, select: { id: true, parentId: true } })
      : null;
  }
  return false;
}

