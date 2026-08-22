import { describe, it, expect } from "vitest";
import { orderTotal, orderCollected, orderRemaining, remainingFrom } from "@/lib/orders";

/**
 * Para hesabı testleri. Bu üç formül önceden beş ayrı bileşende elle tekrarlanıyordu ve
 * hiç testi yoktu; tek kaynağa toplandıktan sonra buraya bağlandı. Önemli olan sadece
 * "doğru topluyor mu" değil, kenar durumlarda ne yaptığı — özellikle string gelen
 * Decimal alanlar ve fazla tahsilat.
 */

describe("orderTotal", () => {
  it("adet × birim fiyat toplamını hesaplar", () => {
    expect(orderTotal([{ quantity: 2, unitPrice: 100 }, { quantity: 3, unitPrice: 50 }])).toBe(350);
  });

  it("Decimal alanlar API'den string geldiğinde de doğru hesaplar", () => {
    // Prisma Decimal -> JSON string; serializeOrder bunu bilerek string bırakıyor.
    expect(orderTotal([{ quantity: 2, unitPrice: "125.50" }])).toBe(251);
  });

  it("form taslağındaki string quantity ile çalışır", () => {
    // OrderDialog'daki ItemDraft kullanıcı yazarken quantity'yi string tutar.
    expect(orderTotal([{ quantity: "3", unitPrice: "10" }])).toBe(30);
  });

  it("boş sipariş için 0 döner", () => {
    expect(orderTotal([])).toBe(0);
  });

  it("yarım doldurulmuş kalemi 0 sayar, NaN üretmez", () => {
    // Kullanıcı yeni kalem ekleyip fiyatı henüz yazmadıysa toplam NaN olmamalı —
    // NaN ekrana "₺NaN" olarak basılır ve tüm özet kartını bozar.
    expect(orderTotal([{ quantity: "1", unitPrice: "" }, { quantity: 2, unitPrice: 10 }])).toBe(20);
    expect(orderTotal([{ quantity: "abc", unitPrice: "xyz" }])).toBe(0);
  });

  it("ondalıklı adetle çalışır (kg/m gibi birimler)", () => {
    expect(orderTotal([{ quantity: 2.5, unitPrice: 40 }])).toBe(100);
  });
});

describe("orderCollected", () => {
  it("ödemeleri toplar", () => {
    expect(orderCollected([{ amount: 100 }, { amount: 250 }])).toBe(350);
  });

  it("string tutarlarla çalışır", () => {
    expect(orderCollected([{ amount: "99.99" }, { amount: "0.01" }])).toBe(100);
  });

  it("hiç ödeme yoksa 0 döner", () => {
    expect(orderCollected([])).toBe(0);
  });

  it("geçersiz tutarı 0 sayar", () => {
    expect(orderCollected([{ amount: "" }, { amount: 50 }])).toBe(50);
  });
});

describe("remainingFrom — kırpma kuralı", () => {
  it("normal durumda farkı döner", () => {
    expect(remainingFrom(1000, 400)).toBe(600);
  });

  it("tam ödendiğinde 0 döner", () => {
    expect(remainingFrom(1000, 1000)).toBe(0);
  });

  it("FAZLA tahsilatta negatif değil 0 döner", () => {
    // Kasıtlı ürün kararı: "kalan -250 TL" göstermek yerine 0 gösteriyoruz.
    expect(remainingFrom(1000, 1250)).toBe(0);
  });
});

describe("orderRemaining", () => {
  it("kalemler ve ödemelerden kalan borcu hesaplar", () => {
    const items = [{ quantity: 4, unitPrice: 250 }];
    const payments = [{ amount: 300 }, { amount: 200 }];
    expect(orderRemaining(items, payments)).toBe(500);
  });

  it("hiç ödeme yapılmamışsa tüm tutar kalır", () => {
    expect(orderRemaining([{ quantity: 1, unitPrice: 750 }], [])).toBe(750);
  });

  it("fazla tahsilatta 0'a kırpar", () => {
    expect(orderRemaining([{ quantity: 1, unitPrice: 100 }], [{ amount: 150 }])).toBe(0);
  });

  it("string Decimal alanlarla uçtan uca doğru çalışır", () => {
    // Gerçek API yanıtının şekli: unitPrice ve amount string.
    const items = [{ quantity: 3, unitPrice: "33.33" }];
    const payments = [{ amount: "50.00" }];
    expect(orderRemaining(items, payments)).toBeCloseTo(49.99, 2);
  });
});
