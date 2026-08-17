import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/api-helpers";

/** Bir etiketi (ve her dosya/klasördeki uygulanmış halini, cascade ile) kalıcı olarak siler. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await params;
    await prisma.tag.delete({ where: { id } }).catch(() => null);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
