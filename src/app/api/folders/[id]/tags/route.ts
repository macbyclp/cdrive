import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canAccessFolder } from "@/lib/access";
import { errorResponse } from "@/lib/api-helpers";

const schema = z.object({ tagId: z.string() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const ok = await canAccessFolder(user, id, "EDIT");
    if (!ok) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });

    const { tagId } = schema.parse(await req.json());
    await prisma.folderTag.upsert({
      where: { tagId_folderId: { tagId, folderId: id } },
      create: { tagId, folderId: id },
      update: {},
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
