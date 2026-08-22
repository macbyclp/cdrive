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

/**
 * Yeni bir sipariş için rastgele, en fazla 8 haneli, benzersiz bir sipariş numarası üretir
 * (1..99.999.999 arası). Çakışma ihtimali çok düşük olsa da (siparişlerin sayısına göre)
 * birkaç deneme ile garanti altına alınıyor; hepsi çakışırsa (pratikte imkansız) null döner
 * ve sipariş orderNumber'sız oluşturulur (görüntüleme id'den türetilen sabit sayıya düşer).
 */
export async function generateOrderNumber(): Promise<number | null> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = Math.floor(Math.random() * 99_999_999) + 1;
    const existing = await prisma.order.findUnique({ where: { orderNumber: candidate } });
    if (!existing) return candidate;
  }
  return null;
}

/**
 * Sipariş tutarı hesapları — TEK KAYNAK.
 *
 * Bu üç formül daha önce beş ayrı yerde (OrderDialog, OrderDetailDialog, OrdersScreen'in
 * iki farklı yeri ve /customers) elle tekrarlanıyordu. Aynı formülün kopyaları zamanla
 * birbirinden ayrışır (biri KDV/iskonto öğrenir, diğeri öğrenmez) ve para hesabında
 * sessiz tutarsızlık en pahalı hata türüdür — o yüzden buraya toplandı.
 *
 * `unitPrice`/`amount` alanları Prisma'da Decimal olduğu için API'den string olarak
 * geliyor; imzalar bilerek `number | string` kabul edip Number()'a çeviriyor.
 */
// Bu fonksiyonlar hem SUNUCUDA (Prisma doğrudan Decimal nesnesi döner) hem
// İSTEMCİDE (API'den JSON string olarak gelir) hem de FORM TASLAĞINDA (kullanıcı
// yazarken her şey string) çağrılıyor. Üçünü birden karşılamak için tip geniş:
// Number() Decimal'in valueOf/toString'ini kullanarak doğru sayıyı üretir.
type Numeric = number | string | { toString(): string };
export type OrderAmountItem = { quantity: Numeric; unitPrice: Numeric };
export type OrderAmountPayment = { amount: Numeric };

/** Kalemlerin (adet × birim fiyat) toplamı — siparişin brüt tutarı. */
export function orderTotal(items: readonly OrderAmountItem[]): number {
  return items.reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0), 0);
}

/** Bu siparişe karşılık girilmiş ödemelerin toplamı. */
export function orderCollected(payments: readonly OrderAmountPayment[]): number {
  return payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
}

/**
 * Kalan borcun kırpma kuralı. Fazla tahsilat (collected > total) durumunda NEGATİF
 * DÖNMEZ, 0'a kırpılır — "kalan -250 TL" göstermek yerine "kalan 0" göstermek kasıtlı
 * bir ürün kararı. Zaten toplanmış (aggregate) rakamlarla çalışan /customers sayfası
 * da aynı kuralı kullansın diye ayrı bir fonksiyon.
 */
export function remainingFrom(total: number, collected: number): number {
  return Math.max(0, total - collected);
}

/** Bir siparişin kalan borcu — kalemler ve ödemelerden hesaplanır. */
export function orderRemaining(
  items: readonly OrderAmountItem[],
  payments: readonly OrderAmountPayment[]
): number {
  return remainingFrom(orderTotal(items), orderCollected(payments));
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
