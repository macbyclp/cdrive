import { NextResponse } from "next/server";
import { AuditAction, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { errorResponse } from "@/lib/api-helpers";
import { toCsv } from "@/lib/csv";

// CSV dışa aktarımında tek istekte dökülebilecek en fazla kayıt — daha geniş aralık
// için tarih filtresiyle parça parça indirilir (bellek/yanıt boyutu sınırı).
const CSV_MAX_ROWS = 10_000;

export async function GET(req: Request) {
  try {
    const me = await requireRole("ADMIN", "MANAGER");
    const { searchParams } = new URL(req.url);
    const csv = searchParams.get("format") === "csv";
    const take = csv ? CSV_MAX_ROWS : Math.min(Number(searchParams.get("take") ?? 100) || 100, 300);
    const skip = csv ? 0 : Math.max(Number(searchParams.get("skip") ?? 0) || 0, 0);
    const where: Prisma.AuditLogWhereInput = {};
    const userId = searchParams.get("userId");
    const action = searchParams.get("action");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    if (userId) where.userId = userId;
    // Departman yöneticisi yalnız kendi departmanındaki kullanıcıların kayıtlarını
    // görür (departmanı yoksa yalnız kendininkileri). Aksi halde kurumun tamamındaki
    // giriş IP'leri, başka departmanların dosya adları ve yönetici işlemleri açığa
    // çıkıyordu — kullanıcı listesi bile yalnız ADMIN'e açıkken.
    if (me.role !== "ADMIN") {
      where.user = me.departmentId ? { departmentId: me.departmentId } : { id: me.id };
    }
    if (action) {
      // Geçersiz eylem adı Prisma'ya enum olarak gitseydi 500 dönerdi.
      if (!Object.hasOwn(AuditAction, action)) {
        return NextResponse.json({ error: "Geçersiz eylem filtresi" }, { status: 400 });
      }
      where.action = action as AuditAction;
    }
    const range: { gte?: Date; lte?: Date } = {};
    if (from && !isNaN(Date.parse(from))) range.gte = new Date(from);
    if (to && !isNaN(Date.parse(to))) range.lte = new Date(to);
    if (range.gte || range.lte) where.createdAt = range;
    const logs = await prisma.auditLog.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true, email: true } } },
    });

    if (!csv) return NextResponse.json(logs);

    const body = toCsv(
      ["Tarih", "Eylem", "Kullanıcı", "E-posta", "Hedef türü", "Hedef", "Ayrıntı", "IP"],
      logs.map((l) => [l.createdAt, l.action, l.user?.name ?? "Anonim", l.user?.email, l.targetType, l.targetId, l.detail, l.ip])
    );
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="denetim-kaydi-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
