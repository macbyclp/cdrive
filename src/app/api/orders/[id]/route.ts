import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canAccessOrders, canCreateOrder, canManageOrders, canManageProduction, canAccessFile } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { errorResponse } from "@/lib/api-helpers";
import { orderIncludeShape as includeShape, serializeOrder, findOrCreateCustomer } from "@/lib/orders";
import { extractInvoiceFields, isExtractableMime } from "@/lib/invoice-extract";
import { geocodeAddress } from "@/lib/geocode";
import { readFile } from "@/lib/storage";
import { notifyUser, notifyUsers } from "@/lib/notify";

async function loadOrder(id: string) {
  return prisma.order.findUnique({ where: { id }, include: includeShape });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const order = await loadOrder(id);
    if (!order) return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });

    const ok =
      canManageOrders(user) || canManageProduction(user) || (canCreateOrder(user) && order.createdById === user.id);
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
  status: z.enum(["PENDING", "APPROVED", "IN_PRODUCTION", "INVOICED", "CANCELLED"]).optional(),
  accountingNote: z.string().trim().max(4000).optional(),
  // İçerik tarafı (sadece sipariş hâlâ "Beklemede"yken, oluşturan kişi veya admin):
  customerName: z.string().trim().min(1).max(200).optional(),
  customerContact: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(4000).optional(),
  items: z.array(itemSchema).min(1).max(100).optional(),
  fileIds: z.array(z.string()).max(20).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  // Üretim tarafı: her kalem için Var(true)/Yok(false) — canManageProduction yetkisi ister,
  // sadece sipariş "Onaylandı"/"Üretimde" iken kabul edilir (bkz. aşağıdaki iş kuralı).
  stockUpdates: z.array(z.object({ itemId: z.string(), inStock: z.boolean() })).max(100).optional(),
});

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Beklemede",
  APPROVED: "Onaylandı",
  IN_PRODUCTION: "Üretimde",
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
    const wantsStockUpdate = body.stockUpdates !== undefined;
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
      // Tek istisna: üretim yetkisi olan biri "Üretim tamamlandı" derken (IN_PRODUCTION →
      // APPROVED) muhasebe yetkisi olmasa da izin verilir — accountingNote göndermediği
      // ve durum kombinasyonu tam olarak bu tek geçişse.
      const isProductionCompletion =
        canManageProduction(user) &&
        body.status === "APPROVED" &&
        body.accountingNote === undefined &&
        existing.status === "IN_PRODUCTION";
      if (!isProductionCompletion) {
        return NextResponse.json({ error: "Durum değiştirme yetkiniz yok" }, { status: 403 });
      }
    }
    if (wantsStockUpdate && !canManageProduction(user)) {
      return NextResponse.json({ error: "Stok güncelleme yetkiniz yok" }, { status: 403 });
    }
    if (wantsStockUpdate && existing.status !== "APPROVED" && existing.status !== "IN_PRODUCTION") {
      return NextResponse.json(
        { error: "Stok durumu sadece onaylanmış/üretimdeki siparişlerde güncellenebilir" },
        { status: 400 }
      );
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
      if (body.stockUpdates) {
        for (const su of body.stockUpdates) {
          // updateMany + orderId koşulu: itemId başka bir siparişe ait olsa bile (id tahmini)
          // sessizce hiçbir şey güncellemez — IDOR koruması.
          await tx.orderItem.updateMany({ where: { id: su.itemId, orderId: id }, data: { inStock: su.inStock } });
        }
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
        await notifyUser({
          userId: existing.createdById,
          type: "ORDER_STATUS_CHANGED",
          message: `"${existing.customerName}" siparişin durumu "${STATUS_LABEL[body.status]}" olarak güncellendi`,
          targetType: "order",
          targetId: id,
        });
      }
    }

    // Stok kontrolü tamamlandığında (bu istekte en az bir kalem işaretlendiyse) otomatik akış:
    // sipariş hâlâ "Onaylandı"ysa ve şu an kalemlerden en az biri "Stokta Yok" ise sipariş
    // kendiliğinden "Üretimde"ye düşer — bunu client'ın status alanı olarak GÖNDERMESİNE gerek
    // yok, iş kuralı burada, sunucu tarafında hesaplanır.
    if (body.stockUpdates && existing.status === "APPROVED") {
      const items = await prisma.orderItem.findMany({ where: { orderId: id } });
      const anyOut = items.some((i) => i.inStock === false);
      if (anyOut) {
        await prisma.order.update({ where: { id }, data: { status: "IN_PRODUCTION", updatedById: user.id } });
        await logAudit({
          userId: user.id,
          action: "ORDER_STATUS_UPDATE",
          targetType: "order",
          targetId: id,
          detail: `${STATUS_LABEL.APPROVED} → ${STATUS_LABEL.IN_PRODUCTION} (stokta olmayan kalem işaretlendi)`,
        });
        // Üretim yetkisi olan herkese (+ admin) haber ver — kuyruğa yeni bir sipariş düştü.
        const producers = await prisma.user.findMany({
          where: { active: true, OR: [{ canManageProduction: true }, { role: "ADMIN" }] },
          select: { id: true },
        });
        await notifyUsers(
          producers.map((p) => p.id),
          "ORDER_STATUS_CHANGED",
          `"${existing.customerName}" siparişi stokta olmayan kalem nedeniyle üretime düştü`,
          "order",
          id
        );
        if (existing.createdById !== user.id) {
          await notifyUser({
            userId: existing.createdById,
            type: "ORDER_STATUS_CHANGED",
            message: `"${existing.customerName}" siparişin durumu "${STATUS_LABEL.IN_PRODUCTION}" olarak güncellendi`,
            targetType: "order",
            targetId: id,
          });
        }
      }
    }

    // Yeni eklenen fatura/belgelerden adres/vergi no/telefon vb. otomatik çekilir —
    // sadece o an BOŞ olan Customer alanları doldurulur, elle girilmiş veri ezilmez.
    // Best-effort: çıkarım başarısız olursa (bozuk dosya, desteklenmeyen tür, OCR hatası)
    // sessizce yok sayılır, PATCH isteği asla bu yüzden başarısız olmaz.
    let extractedSummary: { fileName: string; fields: Record<string, string> } | null = null;
    if (body.fileIds) {
      const existingFileIds = new Set(existing.attachments.map((a) => a.fileId));
      const newFileIds = body.fileIds.filter((fid) => !existingFileIds.has(fid));
      if (newFileIds.length && existing.customerId) {
        extractedSummary = await tryExtractFromNewAttachments(newFileIds, existing.customerId, user.id);
      }
    }

    const updated = await loadOrder(id);
    return NextResponse.json({ ...serializeOrder(updated!), extractedInfo: extractedSummary });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * Sadece muhasebe (+ admin) ve sadece FATURALANMIŞ (INVOICED) siparişler için — akış
 * ("Beklemede"/"Onaylandı") henüz devam eden bir siparişin yanlışlıkla silinmesini
 * engellemek amacıyla bilerek bu duruma kısıtlanıyor. Kalemler/ekler/tahsilatlar
 * (OrderItem/OrderAttachment/Payment) veritabanında Order'a onDelete: Cascade ile
 * bağlı, otomatik silinir — ekli dosyaların KENDİSİ (Drive'daki File kaydı) etkilenmez,
 * sadece sipariş-dosya bağlantısı kalkar.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!canManageOrders(user)) {
      return NextResponse.json({ error: "Sipariş silme yetkiniz yok" }, { status: 403 });
    }
    const { id } = await params;
    const existing = await prisma.order.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });
    if (existing.status !== "INVOICED") {
      return NextResponse.json({ error: "Sadece faturalandı durumundaki siparişler silinebilir" }, { status: 400 });
    }

    await prisma.order.delete({ where: { id } });
    await logAudit({
      userId: user.id,
      action: "ORDER_STATUS_UPDATE",
      targetType: "order",
      targetId: id,
      detail: `"${existing.customerName}" siparişi silindi`,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

async function tryExtractFromNewAttachments(fileIds: string[], customerId: string, userId: string) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) return null;

  for (const fileId of fileIds) {
    try {
      const file = await prisma.file.findUnique({ where: { id: fileId }, include: { currentVersion: true } });
      if (!file?.currentVersion || !isExtractableMime(file.mimeType)) continue;

      const buffer = await readFile(file.currentVersion.storageKey);
      const fields = await extractInvoiceFields(buffer, file.mimeType);
      if (!fields) continue;

      // Sadece o an boş olan alanlar doldurulur — daha önce elle girilmiş/onaylanmış
      // veri otomatik olarak asla ezilmez.
      const patch: Record<string, string> = {};
      if (fields.address && !customer.address) patch.address = fields.address;
      if (fields.taxNumber && !customer.taxNumber) patch.taxNumber = fields.taxNumber;
      if (fields.taxOffice && !customer.taxOffice) patch.taxOffice = fields.taxOffice;
      if (fields.phone && !customer.phone) patch.phone = fields.phone;
      if (fields.email && !customer.email) patch.email = fields.email;

      if (Object.keys(patch).length === 0) continue;

      // Yeni yazılan adres varsa Panel'deki "Genel Görünüm" haritası için tek seferlik
      // geocode edilip (OpenStreetMap Nominatim, ücretsiz) önbelleğe alınıyor — hata
      // olursa (ağ/rate-limit) sessizce atlanır, müşteri kaydı yine de güncellenir.
      const geo = patch.address ? await geocodeAddress(patch.address) : null;

      await prisma.customer.update({
        where: { id: customerId },
        data: { ...patch, ...(geo ? { lat: geo.lat, lng: geo.lng } : {}) },
      });
      await logAudit({
        userId,
        action: "CUSTOMER_AUTO_UPDATE",
        targetType: "customer",
        targetId: customerId,
        detail: `"${file.name}" faturasından otomatik çekildi: ${Object.keys(patch).join(", ")}`,
      });
      return { fileName: file.name, fields: patch };
    } catch {
      // Bu dosyada çıkarım başarısız oldu — diğer yeni ekleri denemeye devam et.
      continue;
    }
  }
  return null;
}
