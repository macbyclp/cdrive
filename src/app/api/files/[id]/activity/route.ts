import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canAccessFile } from "@/lib/access";
import { errorResponse } from "@/lib/api-helpers";

/** Bir dosyanın erişim/işlem geçmişi — "kim ne zaman ne yaptı" (indirdi, yeniden adlandırdı, paylaştı vb.). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const ok = await canAccessFile(user, id, "EDIT");
    if (!ok) return NextResponse.json({ error: "Bu geçmişi görme yetkiniz yok" }, { status: 403 });

    const logs = await prisma.auditLog.findMany({
      where: { targetType: "file", targetId: id },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { user: { select: { name: true, email: true } } },
    });
    return NextResponse.json({ logs });
  } catch (err) {
    return errorResponse(err);
  }
}
