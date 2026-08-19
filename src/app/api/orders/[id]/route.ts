import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canAccessOrders, canCreateOrder, canManageOrders, canAccessFile } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { errorResponse } from "@/lib/api-helpers";
import { orderIncludeShape as includeShape, serializeOrder, findOrCreateCustomer } from "@/lib/orders";

async function loadOrder(id: string) {
  return prisma.order.findUnique({ where: { id }, include: includeShape });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const order = await loadOrder(id);
    if (!order) return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });

    const ok = canManageOrders(user) || (canCreateOrder(user) && order.createdById === user.id);
    if (!ok) return NextResponse.json({ error: "Bu siparişe erişiminiz yok" }, { status: 403 });

    return NextResponse.json(serializeOrder(order));
  } catch (err) {
    return errorResponse(err);
  }
}

const itemSchema = z.object({
  productName: z.string().trim().min(1).max(200),
  quantity: z.number().int().min(1).max(1_000_000),
  unitPrice: z.number().min(0).max(100_000_000),
});

const patchSchema = z.object({
  // Muhasebe tarafı:
  status: z.enum(["PENDING", "APPROVED", "INVOICED", "CANCELLED"]).optional(),
  accountingNote: z.string().trim().max(4000).optional(),
  // İçerik tarafı (sadece sipariş hâlâ "Beklemede"yken, oluşturan kişi veya admin):
  customerName: z.string().trim().min(1).max(200).optional(),
  customerContact: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(4000).optional(),
  items: z.array(itemSchema).min(1).max(100).optional(),
  fileIds: z.array(z.string()).max(20).optional(),
  dueDate: z.string().datetime().nullable().optional(),
});

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Beklemede",
  APPROVED: "Onaylandı",
  INVOICED: "Faturalandı",
  CANCELLED: "İptal",
};

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!canAccessOrders(user)) return NextResponse.json({ error: "Bu bölüme erişiminiz yok" }, { status: 403 });
    const { id } = await params;
    const existing = await loadOrder(id);
    if (!existing) return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });

    const body = patchSchema.parse(await req.json());
    const wantsStatusChange = body.status !== undefined || body.accountingNote !== undefined;
    // Ekler ayrı tutuluyor: muhasebe onay/fatura sürecinde (durum ne olursa olsun) resmi
    // faturayı/belgeyi siparişe iliştirebilsin diye — diğer içerik alanları hâlâ sadece
    // "Beklemede" iken oluşturan kişiye (veya admin'e) açık.
    const wantsAttachmentChange = body.fileIds !== undefined;
    const wantsOtherContentChange =
      body.customerName !== undefined ||
      body.customerContact !== undefined ||
      body.notes !== undefined ||
      body.items !== undefined ||
      body.dueDate !== undefined;

    if (wantsStatusChange && !canManageOrders(user)) {
      return NextResponse.json({ error: "Durum değiştirme yetkiniz yok" }, { status: 403 });
    }
    if (wantsOtherContentChange) {
      const isOwnerWhilePending = existing.createdById === user.id && existing.status === "PENDING" && canCreateOrder(user);
      if (!isOwnerWhilePending && user.role !== "ADMIN") {
        return NextResponse.json(
          { error: "İçeriği sadece beklemedeki kendi siparişinizde (veya admin olarak) değiştirebilirsiniz" },
          { status: 403 }
        );
      }
    }
    if (wantsAttachmentChange) {
      const isOwnerWhilePending = existing.createdById === user.id && existing.status === "PENDING" && canCreateOrder(user);
      const isAccounting = canManageOrders(user);
      if (!isOwnerWhilePending && !isAccounting && user.role !== "ADMIN") {
        return NextResponse.json({ error: "Ek dosya ekleme/kaldırma yetkiniz yok" }, { status: 403 });
      }
    }

    if (body.fileIds) {
      for (const fileId of body.fileIds) {
        const ok = await canAccessFile(user, fileId, "VIEW");
        if (!ok) return NextResponse.json({ error: "Eklemek istediğiniz bir dosyaya erişiminiz yok" }, { status: 403 });
      }
    }

    const data: Record<string, unknown> = { updatedById: user.id };
    if (body.status !== undefined) data.status = body.status;
    if (body.accountingNote !== undefined) data.accountingNote = body.accountingNote || null;
    if (body.customerName !== undefined) data.customerName = body.customerName;
    if (body.customerContact !== undefined) data.customerContact = body.customerContact || null;
    if (body.notes !== undefined) data.notes = body.notes || null;
    if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    if (body.customerName !== undefined) {
      const customer = await findOrCreateCustomer(body.customerName, body.customerContact ?? existing.customerContact);
      data.customerId = customer.id;
    }

    await prisma.$transaction(async (tx) => {
      if (body.items) {
        await tx.orderItem.deleteMany({ where: { orderId: id } });
        await tx.orderItem.createMany({ data: body.items!.map((i) => ({ ...i, orderId: id })) });
      }
      if (body.fileIds) {
        await tx.orderAttachment.deleteMany({ where: { orderId: id } });
        if (body.fileIds!.length) {
          await tx.orderAttachment.createMany({ data: body.fileIds!.map((fileId) => ({ orderId: id, fileId })) });
        }
      }
      await tx.order.update({ where: { id }, data });
    });

    if (body.status && body.status !== existing.status) {
      await logAudit({
        userId: user.id,
        action: "ORDER_STATUS_UPDATE",
        targetType: "order",
        targetId: id,
        detail: `${STATUS_LABEL[existing.status]} → ${STATUS_LABEL[body.status]}`,
      });
      if (existing.createdById !== user.id) {
        await prisma.notification.create({
          data: {
            userId: existing.createdById,
            type: "ORDER_STATUS_CHANGED",
            message: `"${existing.customerName}" siparişin durumu "${STATUS_LABEL[body.status]}" olarak güncellendi`,
            targetType: "order",
            targetId: id,
          },
        });
      }
    }

    const updated = await loadOrder(id);
    return NextResponse.json(serializeOrder(updated!));
  } catch (err) {
    return errorResponse(err);
  }
}
