import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { errorResponse } from "@/lib/api-helpers";

const schema = z.object({ userEmail: z.string().email() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("ADMIN");
    const { id } = await params;
    const body = schema.parse(await req.json());
    const targetUser = await prisma.user.findUnique({ where: { email: body.userEmail.toLowerCase() } });
    if (!targetUser) return NextResponse.json({ error: "Kullanıcı bulunamadı" }, { status: 404 });

    await prisma.groupMember.upsert({
      where: { groupId_userId: { groupId: id, userId: targetUser.id } },
      create: { groupId: id, userId: targetUser.id },
      update: {},
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
