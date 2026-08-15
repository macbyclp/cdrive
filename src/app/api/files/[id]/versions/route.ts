import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canAccessFile } from "@/lib/access";
import { errorResponse } from "@/lib/api-helpers";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const ok = await canAccessFile(user, id, "VIEW");
    if (!ok) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });

    const versions = await prisma.fileVersion.findMany({
      where: { fileId: id },
      orderBy: { versionNo: "desc" },
      include: { uploadedBy: { select: { name: true, email: true } } },
    });
    return NextResponse.json(
      versions.map((v) => ({ ...v, size: v.size.toString() }))
    );
  } catch (err) {
    return errorResponse(err);
  }
}
