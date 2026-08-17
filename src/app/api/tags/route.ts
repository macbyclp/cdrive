import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/api-helpers";

// Etiketler şirket genelinde paylaşılan bir taksonomidir — özel bir izin
// sistemi yok, oturum açmış herkes listeleyebilir/oluşturabilir (dosyaya
// UYGULAMAK için yine o dosyada EDIT izni gerekir, bkz. /api/files/[id]/tags).
export async function GET() {
  try {
    await requireUser();
    const tags = await prisma.tag.findMany({ orderBy: { name: "asc" } });
    return NextResponse.json({ tags });
  } catch (err) {
    return errorResponse(err);
  }
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

export async function POST(req: Request) {
  try {
    await requireUser();
    const body = createSchema.parse(await req.json());
    const existing = await prisma.tag.findUnique({ where: { name: body.name } });
    if (existing) return NextResponse.json(existing);
    const tag = await prisma.tag.create({
      data: { name: body.name, color: body.color ?? "#6366f1" },
    });
    return NextResponse.json(tag);
  } catch (err) {
    return errorResponse(err);
  }
}
