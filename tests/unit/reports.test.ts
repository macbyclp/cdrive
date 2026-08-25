import { describe, it, expect } from "vitest";
import { monthlyRevenueSeries, departmentStorageUsage, type ReportOrderInput, type ReportPaymentInput } from "@/lib/reports";

/**
 * Rapor hesap katmanı testleri — DB yok, saf fonksiyonlar. Ay bucket'ları "şu an"e
 * göre üretildiği için testler de tarihleri `new Date()`'ten türetir: serinin son
 * satırı her zaman içinde bulunulan aydır, sondan ikincisi geçen ay. Bu yüzden
 * beklenen değerler konuma (series.at(-1) vb.) ile eşleştirilir — ay isimlerini
 * test içinde yeniden formatlamak yerine.
 */

// Test yardımcıları — tarihler ayın 15'ine konur (kısa aylarda sınır kayması olmasın).
const now = new Date();
function monthsAgo(n: number, day = 15): Date {
  return new Date(now.getFullYear(), now.getMonth() - n, day, 12, 0, 0);
}

function order(monthsBack: number, status: string, items: { quantity: number; unitPrice: number }[]): ReportOrderInput {
  return { createdAt: monthsAgo(monthsBack), status, items };
}

// amount bilerek `number | string` — Prisma Decimal sunucuda Decimal nesnesi,
// API yanıtında string gelir; seri ikisini de karşılamalı (Numeric, bkz. lib/orders).
function payment(monthsBack: number, amount: number | string, orderId = "o1"): ReportPaymentInput {
  return { amount, paidAt: monthsAgo(monthsBack), orderId };
}

describe("monthlyRevenueSeries", () => {
  it("boş girdide istenen ay sayısı kadar sıfır satır döner", () => {
    const series = monthlyRevenueSeries([], [], 6);
    expect(series).toHaveLength(6);
    for (const row of series) {
      expect(row.revenue).toBe(0);
      expect(row.collected).toBe(0);
      expect(row.orderCount).toBe(0);
    }
  });

  it("aylık satır kronolojik sıralı ve ay anahtarları artan gider", () => {
    const series = monthlyRevenueSeries([], [], 3);
    expect(series.map((r) => r.month)).toEqual([...series.map((r) => r.month)].sort());
    // Son satır içinde bulunulan ay olmalı — "YYYY-MM" biçimi yerel takvim ayıyla.
    const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    expect(series[series.length - 1].month).toBe(thisMonthKey);
  });

  it("kayıt olmayan ara aylar da satır olarak durur (sıfırlarla)", () => {
    // Yalnız 2 ay önce sipariş var; bu ay ve geçen ay satırı yine dönmeli.
    const series = monthlyRevenueSeries([order(2, "APPROVED", [{ quantity: 1, unitPrice: 100 }])], [], 3);
    expect(series).toHaveLength(3);
    expect(series[0].orderCount).toBe(1);
    expect(series[1].orderCount).toBe(0);
    expect(series[2].orderCount).toBe(0);
  });

  it("CANCELLED sipariş ciroya ve adede girmez", () => {
    const series = monthlyRevenueSeries(
      [
        order(0, "CANCELLED", [{ quantity: 5, unitPrice: 200 }]),
        order(0, "INVOICED", [{ quantity: 2, unitPrice: 100 }]),
      ],
      [],
      1
    );
    const thisMonth = series[series.length - 1];
    expect(thisMonth.revenue).toBe(200);
    expect(thisMonth.orderCount).toBe(1);
  });

  it("ciro = o ay yaratılan siparişlerin orderTotal toplamı (Decimal string kalemler dahil)", () => {
    const series = monthlyRevenueSeries(
      [order(0, "PENDING", [{ quantity: 2, unitPrice: 100 }, { quantity: 1, unitPrice: 50 }])],
      [],
      1
    );
    expect(series[series.length - 1].revenue).toBe(250);
  });

  it("tahsilat ayı paidAt'e göredir: Aralık siparişi Ocak ödemesi → Aralık ciro, Ocak tahsilat", () => {
    // Sipariş 1 ay önce (geçen ay), ödeme bu ay yapıldı.
    const series = monthlyRevenueSeries(
      [order(1, "INVOICED", [{ quantity: 1, unitPrice: 1000 }])],
      [payment(0, 400), payment(0, "100.50")],
      2
    );
    const lastMonth = series[series.length - 2];
    const thisMonth = series[series.length - 1];
    expect(lastMonth.revenue).toBe(1000);
    expect(lastMonth.collected).toBe(0);
    expect(thisMonth.revenue).toBe(0);
    expect(thisMonth.collected).toBe(500.5);
  });

  it("ödemenin siparişi iptal olsa bile tahsilat gerçektir — collected'a dahil edilir", () => {
    // Sipariş iptal edildi ama iptalden önce para tahsil edilmiş; raporda ciro 0,
    // tahsilat gerçek kalmalı (kalan borç hesabı yapılırken kırpmayı remainingFrom üstlenir).
    const series = monthlyRevenueSeries(
      [order(0, "CANCELLED", [{ quantity: 1, unitPrice: 999 }])],
      [payment(0, 300)],
      1
    );
    const thisMonth = series[series.length - 1];
    expect(thisMonth.revenue).toBe(0);
    expect(thisMonth.orderCount).toBe(0);
    expect(thisMonth.collected).toBe(300);
  });

  it("aynı ayda fazla tahsilat olsa bile collected ham kalır (negatif kırpma burada değil)", () => {
    // Kırpma kuralı remainingFrom'ta yaşar; seri ham rakamları raporlar.
    const series = monthlyRevenueSeries(
      [order(0, "APPROVED", [{ quantity: 1, unitPrice: 100 }])],
      [payment(0, 150)],
      1
    );
    const thisMonth = series[series.length - 1];
    expect(thisMonth.revenue).toBe(100);
    expect(thisMonth.collected).toBe(150);
  });

  it("13 ay veri verilip months=12 istenince en eski ay pencere dışında kalır", () => {
    const orders = Array.from({ length: 13 }, (_, i) => order(i, "APPROVED", [{ quantity: 1, unitPrice: 100 }]));
    const series = monthlyRevenueSeries(orders, [], 12);
    expect(series).toHaveLength(12);
    // Görünen 12 ayın HEPSİNDE birer sipariş var; 13 ay önceki düşmüş.
    expect(series.every((r) => r.orderCount === 1 && r.revenue === 100)).toBe(true);
  });

  it("pencere dışı ödeme (daha eski paidAt) hiçbir aya yazılmaz", () => {
    const series = monthlyRevenueSeries([], [payment(5, 750)], 3);
    expect(series.reduce((sum, r) => sum + r.collected, 0)).toBe(0);
  });
});

describe("departmentStorageUsage", () => {
  const departments = [
    { id: "d1", name: "Muhasebe", quotaBytes: 5_368_709_120n },
    { id: "d2", name: "Arge", quotaBytes: 10_737_418_240n },
  ];

  it("kullanıcı yoksa tüm departmanlar sıfır kullanımla döner, unassigned da sıfır", () => {
    const usage = departmentStorageUsage(departments, []);
    expect(usage.departments).toHaveLength(2);
    for (const d of usage.departments) {
      expect(d.usedBytes).toBe(0);
      expect(d.userCount).toBe(0);
    }
    expect(usage.unassigned).toEqual({ usedBytes: 0, userCount: 0 });
  });

  it("departmansız kullanıcılar unassigned'a gider", () => {
    const usage = departmentStorageUsage(departments, [
      { departmentId: null, usedBytes: 1_048_576n },
      { departmentId: null, usedBytes: 512n },
      { departmentId: "d1", usedBytes: 100n },
    ]);
    expect(usage.unassigned).toEqual({ usedBytes: 1_048_576 + 512, userCount: 2 });
    expect(usage.departments.find((d) => d.id === "d1")!.userCount).toBe(1);
    expect(usage.departments.find((d) => d.id === "d2")!.userCount).toBe(0);
  });

  it("bigint kullanımlar Number'a çevrilir ve aynı departmandaki kullanıcılar toplanır", () => {
    const usage = departmentStorageUsage(departments, [
      { departmentId: "d2", usedBytes: 2_147_483_648n },
      { departmentId: "d2", usedBytes: 1_073_741_824n },
    ]);
    const arge = usage.departments.find((d) => d.id === "d2")!;
    expect(arge.usedBytes).toBe(2_147_483_648 + 1_073_741_824);
    expect(arge.quotaBytes).toBe(10_737_418_240);
    expect(arge.userCount).toBe(2);
    // BigInt kalmadığını da doğrula — JSON.stringify bigint üzerinde patlar.
    expect(JSON.parse(JSON.stringify(usage)).departments[0].usedBytes).toBeTypeOf("number");
  });

  it("departmanlar ada göre sıralı döner", () => {
    const usage = departmentStorageUsage(
      [
        { id: "d1", name: "Satış", quotaBytes: 1n },
        { id: "d2", name: "Arge", quotaBytes: 1n },
        { id: "d3", name: "Bütçe", quotaBytes: 1n },
      ],
      []
    );
    expect(usage.departments.map((d) => d.name)).toEqual(["Arge", "Bütçe", "Satış"]);
  });

  it("listede olmayan departmentId'li kullanıcı veri kaybetmesin diye unassigned'a düşer", () => {
    // FK gereği normalde imkansız; savunmacı davranış kontratı.
    const usage = departmentStorageUsage(departments, [{ departmentId: "yok", usedBytes: 42n }]);
    expect(usage.unassigned).toEqual({ usedBytes: 42, userCount: 1 });
  });
});
