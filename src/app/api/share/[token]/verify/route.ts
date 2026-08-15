import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth";
import { errorResponse } from "@/lib/api-helpers";

const schema = z.object({ password: z.string() });

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const { password } = schema.parse(await req.json());
    const link = await prisma.shareLink.findUnique({ where: { token } });
    if (!link || link.revoked) return NextResponse.json({ error: "Bağlantı geçersiz" }, { status: 404 });
    if (!link.passwordHash) return NextResponse.json({ ok: true });
    if (!(await verifyPassword(password, link.passwordHash))) {
      return NextResponse.json({ error: "Şifre hatalı" }, { status: 401 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
