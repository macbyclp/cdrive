import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { errorResponse } from "@/lib/api-helpers";

/** Kullanıcı grupları — izin şablonlarında ve paylaşımlarda "kime" sorusunu tek grup adıyla cevaplamak için. */
export async function GET() {
  try {
    await requireRole("ADMIN");
    const groups = await prisma.group.findMany({
      orderBy: { name: "asc" },
      include: { members: { include: { user: { select: { id: true, name: true, email: true } } } } },
    });
    return NextResponse.json(
      groups.map((g) => ({ id: g.id, name: g.name, members: g.members.map((m) => m.user) }))
    );
  } catch (err) {
    return errorResponse(err);
  }
}

const schema = z.object({ name: z.string().trim().min(1).max(100) });

export async function POST(req: Request) {
  try {
    await requireRole("ADMIN");
    const body = schema.parse(await req.json());
    const group = await prisma.group.create({ data: { name: body.name } });
    return NextResponse.json({ id: group.id, name: group.name, members: [] });
  } catch (err) {
    return errorResponse(err);
  }
}
