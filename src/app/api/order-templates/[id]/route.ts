import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canManageOrders } from "@/lib/access";
import { errorResponse } from "@/lib/api-helpers";

/** Şablon silme — sadece oluşturan kişi veya muhasebe/admin yetkisi olanlar (canManageOrders). */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const template = await prisma.orderTemplate.findUnique({ where: { id } });
    if (!template) return NextResponse.json({ error: "Şablon bulunamadı" }, { status: 404 });
    if (template.createdById !== user.id && !canManageOrders(user)) {
      return NextResponse.json({ error: "Bu şablonu silme yetkiniz yok" }, { status: 403 });
    }
    await prisma.orderTemplate.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
