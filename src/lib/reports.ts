import { orderTotal, orderCollected, type OrderAmountItem, type OrderAmountPayment } from "@/lib/orders";

/**
 * Rapor hesap katmanı — DB'ye bağlanmaz, kendisine verilen diziler üzerinden saf
 * hesap yapar (pattern: lib/orders.ts'in para fonksiyonları gibi). API rotaları
 * (src/app/api/reports/*) Prisma'dan çeker, burada toplar; birim testler DB'siz
 * bu fonksiyonları çalıştırır.
 *
 * Para hesabında ASLA yerel formül yazılmaz — ciro orderTotal'dan, tahsilat
 * orderCollected'dan gelir (tek kaynak; kopyaların ayrışması para hesabında en
 * pahalı hata türüdür, bkz. commit 98c9c92).
 */

/** monthlyRevenueSeries'in girdisi — Prisma Order'ın rapor için gereken alt kümesi. */
export type ReportOrderInput = { createdAt: Date; status: string; items: OrderAmountItem[] };

/** monthlyRevenueSeries'in ödeme girdisi — amount Decimal/string/number olabilir (Numeric). */
export type ReportPaymentInput = OrderAmountPayment & { paidAt: Date; orderId: string };

/** Aylık ciro/tahsilat serisinin tek satırı. month "YYYY-MM" biçiminde yerel takvim ayı. */
export type MonthlyRevenuePoint = { month: string; revenue: number; collected: number; orderCount: number };

/** Date'i yerel takvim ayı anahtarına ("YYYY-MM") çevirir — bucket kimliği. */
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Son `months` takvim ayının ciro/tahsilat serisi (şu anki ay dahil, kronolojik
 * sıralı, en eski → en yeni). Ay bucket'ı dashboard ile aynı yaklaşımla yerel
 * zamanın `new Date(y, m, 1)`'i — Prisma'dan gelen Date'ler zaten yerel saat
 * diliminde yorumlanıyor.
 *
 * - revenue: o ay YARATILAN, CANCELLED olmayan siparişlerin orderTotal toplamı.
 * - collected: paidAt'i o aya düşen ödemelerin orderCollected toplamı. Ödemenin
 *   siparişi sonradan iptal edilmiş olsa bile ödeme gerçektir — dahil edilir.
 *   (Gerekirse ciro ile tahsilatı aynı ayda kıyaslayan arayüz "fazla tahsilat"
 *   durumunu remainingFrom kırpmasıyla gösterir; buradaki sayı ham kalır.)
 * - orderCount: o ay yaratılan CANCELLED olmayan sipariş adedi.
 *
 * Kayıt hiç olmayan ay da sıfırlarla satır döner — grafik ekseninde boşluk
 * oluşmasın diye. Pencere dışındaki (daha eski) kayıtlar sessizce düşer.
 */
export function monthlyRevenueSeries(
  orders: readonly ReportOrderInput[],
  payments: readonly ReportPaymentInput[],
  months: number
): MonthlyRevenuePoint[] {
  if (months < 1) return [];

  const now = new Date();
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    keys.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  }
  const inWindow = new Set(keys);

  const revenueByMonth = new Map<string, number>();
  const countByMonth = new Map<string, number>();
  for (const o of orders) {
    if (o.status === "CANCELLED") continue;
    const key = monthKey(o.createdAt);
    if (!inWindow.has(key)) continue;
    revenueByMonth.set(key, (revenueByMonth.get(key) ?? 0) + orderTotal(o.items));
    countByMonth.set(key, (countByMonth.get(key) ?? 0) + 1);
  }

  // Tahsilat ayı paidAt'e göre — siparişin yaratıldığı aya değil. Gruplayıp her
  // ayı tek orderCollected çağrısıyla topluyoruz (formül tek kaynakta kalsın).
  const paymentsByMonth = new Map<string, OrderAmountPayment[]>();
  for (const p of payments) {
    const key = monthKey(p.paidAt);
    if (!inWindow.has(key)) continue;
    const list = paymentsByMonth.get(key);
    if (list) list.push(p);
    else paymentsByMonth.set(key, [p]);
  }

  return keys.map((month) => ({
    month,
    revenue: revenueByMonth.get(month) ?? 0,
    collected: orderCollected(paymentsByMonth.get(month) ?? []),
    orderCount: countByMonth.get(month) ?? 0,
  }));
}

/** departmentStorageUsage'un departman girdisi — Prisma Department'ın alt kümesi. */
export type ReportDepartmentInput = { id: string; name: string; quotaBytes: bigint };

/** departmentStorageUsage'un kullanıcı girdisi — Prisma User'ın alt kümesi (tüm
 * kullanıcılar: pasif olanlar da diskte yer kaplar, ayırt edilmez). */
export type ReportUserInput = { departmentId: string | null; usedBytes: bigint };

/** Departman bazlı depolama kullanım satırı — bigint'ler JSON'a güvenle gitsin
 * diye Number'a çevrilmiştir (gerçekçi byte boyutları Number'ın hassasiyetinde). */
export type DepartmentStorageRow = {
  id: string;
  name: string;
  usedBytes: number;
  quotaBytes: number;
  userCount: number;
};

export type DepartmentStorageUsage = {
  departments: DepartmentStorageRow[];
  unassigned: { usedBytes: number; userCount: number };
};

/**
 * Departman bazlı depolama kullanımı: her departmandaki kullanıcıların usedBytes
 * toplamı ve kullanıcı sayısı; departmansız (departmentId null) kullanıcılar
 * ayrı bir "unassigned" kaleminde. Satırlar ada göre sıralı (Türkçe locale —
 * "İ"/"ı" harfleri ASCII sıralamasında yanlış yere düşer).
 *
 * departmentId'si listedeki hiçbir departmana denk düşmeyen kullanıcı (FK
 * gereği normalde imkansız) veri kaybetmesin diye unassigned'a yazılır.
 */
export function departmentStorageUsage(
  departments: readonly ReportDepartmentInput[],
  users: readonly ReportUserInput[]
): DepartmentStorageUsage {
  const byId = new Map<string, { id: string; name: string; quotaBytes: number; usedBytes: number; userCount: number }>();
  for (const d of departments) {
    byId.set(d.id, { id: d.id, name: d.name, quotaBytes: Number(d.quotaBytes), usedBytes: 0, userCount: 0 });
  }

  let unassignedUsed = 0;
  let unassignedCount = 0;
  for (const u of users) {
    const entry = u.departmentId ? byId.get(u.departmentId) : undefined;
    if (entry) {
      entry.usedBytes += Number(u.usedBytes);
      entry.userCount += 1;
    } else {
      unassignedUsed += Number(u.usedBytes);
      unassignedCount += 1;
    }
  }

  return {
    departments: [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "tr")),
    unassigned: { usedBytes: unassignedUsed, userCount: unassignedCount },
  };
}
