import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canAccessFile } from "@/lib/access";
import { errorResponse } from "@/lib/api-helpers";

/** Bir dosyanın yorumları — dosyayı görebilen herkes okuyabilir/yazabilir. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const ok = await canAccessFile(user, id, "VIEW");
    if (!ok) return NextResponse.json({ error: "Bu dosyaya erişiminiz yok" }, { status: 403 });

    const comments = await prisma.fileComment.findMany({
      where: { fileId: id },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    return NextResponse.json(comments);
  } catch (err) {
    return errorResponse(err);
  }
}

const createSchema = z.object({ content: z.string().trim().min(1).max(2000) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const ok = await canAccessFile(user, id, "VIEW");
    if (!ok) return NextResponse.json({ error: "Bu dosyaya erişiminiz yok" }, { status: 403 });

    const body = createSchema.parse(await req.json());
    const comment = await prisma.fileComment.create({
      data: { fileId: id, userId: user.id, content: body.content },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    return NextResponse.json(comment);
  } catch (err) {
    return errorResponse(err);
  }
}
