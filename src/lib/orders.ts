import { prisma } from "@/lib/prisma";

/** Sipariş API rotaları arasında paylaşılan include şekli + Decimal alanların JSON'a çevrilmesi. */
export const orderIncludeShape = {
  createdBy: { select: { id: true, name: true, email: true } },
  updatedBy: { select: { id: true, name: true, email: true } },
  items: true,
  attachments: { include: { file: { select: { id: true, name: true, mimeType: true } } } },
  payments: {
    include: { recordedBy: { select: { id: true, name: true, email: true } } },
    orderBy: { paidAt: "desc" as const },
  },
} as const;

/**
 * Aynı isimde bir Customer varsa onu döner, yoksa oluşturur — sipariş her açıldığında
 * "Müşteriler" sayfasındaki toplu istatistiklerin doğru kişide birikmesi için. İsim
 * karşılaştırması trim edilmiş tam eşleşmedir (MySQL'in varsayılan koleksiyon düzeni
 * zaten büyük/küçük harf duyarsız).
 */
export async function findOrCreateCustomer(name: string, contact?: string | null) {
  const trimmed = name.trim();
  const existing = await prisma.customer.findFirst({ where: { name: trimmed } });
  if (existing) {
    // İletişim bilgisi ilk kez giriliyorsa (ör. önceki siparişte boş bırakılmış) güncelle;
    // varsa üzerine yazma — hangi siparişin daha güncel/doğru olduğu belli değil.
    if (contact && !existing.contact) {
      return prisma.customer.update({ where: { id: existing.id }, data: { contact } });
    }
    return existing;
  }
  return prisma.customer.create({ data: { name: trimmed, contact: contact || null } });
}

export function serializeOrder(o: {
  items: { unitPrice: unknown; [k: string]: unknown }[];
  payments: { amount: unknown; [k: string]: unknown }[];
  [k: string]: unknown;
}) {
  return {
    ...o,
    items: o.items.map((i) => ({ ...i, unitPrice: i.unitPrice!.toString() })),
    payments: o.payments.map((p) => ({ ...p, amount: p.amount!.toString() })),
  };
}
