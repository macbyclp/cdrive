import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canAccessOrders, canCreateOrder, canManageOrders, canAccessFile } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { errorResponse } from "@/lib/api-helpers";

const includeShape = {
  createdBy: { select: { id: true, name: true, email: true } },
  updatedBy: { select: { id: true, name: true, email: true } },
  items: true,
  attachments: { include: { file: { select: { id: true, name: true, mimeType: true } } } },
} as const;

function serializeOrder(o: {
  items: { unitPrice: unknown; [k: string]: unknown }[];
  [k: string]: unknown;
}) {
  return {
    ...o,
    items: o.items.map((i) => ({ ...i, unitPrice: i.unitPrice!.toString() })),
  };
}

/** Sipariş listesi — muhasebe tüm siparişleri görür, pazarlama sadece kendi oluşturduklarını. */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    if (!canAccessOrders(user)) return NextResponse.json({ error: "Bu bölüme erişiminiz yok" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const statusFilter = status && status !== "ALL" ? { status: status as "PENDING" | "APPROVED" | "INVOICED" | "CANCELLED" } : {};

    const where = canManageOrders(user) ? statusFilter : { ...statusFilter, createdById: user.id };

    const orders = await prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: includeShape,
    });
    return NextResponse.json(orders.map(serializeOrder));
  } catch (err) {
    return errorResponse(err);
  }
}

const itemSchema = z.object({
  productName: z.string().trim().min(1).max(200),
  quantity: z.number().int().min(1).max(1_000_000),
  unitPrice: z.number().min(0).max(100_000_000),
});

const createSchema = z.object({
  customerName: z.string().trim().min(1).max(200),
  customerContact: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(4000).optional(),
  items: z.array(itemSchema).min(1).max(100),
  fileIds: z.array(z.string()).max(20).optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (!canCreateOrder(user)) return NextResponse.json({ error: "Sipariş oluşturma yetkiniz yok" }, { status: 403 });

    const body = createSchema.parse(await req.json());

    // Eklenmek istenen dosyalara gerçekten erişimi var mı — başkasının özel dosyasını
    // ID tahmin ederek siparişe iliştirip herkese görünür kılmasın (IDOR koruması).
    for (const fileId of body.fileIds ?? []) {
      const ok = await canAccessFile(user, fileId, "VIEW");
      if (!ok) return NextResponse.json({ error: "Eklemek istediğiniz bir dosyaya erişiminiz yok" }, { status: 403 });
    }

    const order = await prisma.order.create({
      data: {
        customerName: body.customerName,
        customerContact: body.customerContact || null,
        notes: body.notes || null,
        createdById: user.id,
        items: { create: body.items },
        attachments: body.fileIds?.length ? { create: body.fileIds.map((fileId) => ({ fileId })) } : undefined,
      },
      include: includeShape,
    });

    await logAudit({
      userId: user.id,
      action: "ORDER_CREATE",
      targetType: "order",
      targetId: order.id,
      detail: `${body.customerName} için sipariş açıldı`,
    });

    // Muhasebe tarafındaki herkese (+ admin) bildirim — kendi oluşturduysa kendine gitmesin.
    const managers = await prisma.user.findMany({
      where: { active: true, OR: [{ canManageOrders: true }, { role: "ADMIN" }], NOT: { id: user.id } },
      select: { id: true },
    });
    if (managers.length > 0) {
      await prisma.notification.createMany({
        data: managers.map((m) => ({
          userId: m.id,
          type: "ORDER_CREATED" as const,
          message: `${user.name}, "${body.customerName}" için yeni bir sipariş kaydı açtı`,
          targetType: "order",
          targetId: order.id,
        })),
      });
    }

    return NextResponse.json(serializeOrder(order));
  } catch (err) {
    return errorResponse(err);
  }
}
