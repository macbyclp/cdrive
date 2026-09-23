import { describe, it, expect } from "vitest";
import { byteSize, parseOrderStatusFilter } from "@/lib/validation";

describe("byteSize", () => {
  it("pozitif tamsayıyı kabul eder", () => {
    expect(byteSize.parse(5 * 1024 ** 3)).toBe(5 * 1024 ** 3);
  });
  it("ondalıklı değeri reddeder (BigInt'e çevrilemez)", () => {
    expect(byteSize.safeParse(1.5).success).toBe(false);
  });
  it("sıfır ve negatif değeri reddeder", () => {
    expect(byteSize.safeParse(0).success).toBe(false);
    expect(byteSize.safeParse(-1024).success).toBe(false);
  });
  it("güvenli tamsayı sınırının üstünü reddeder", () => {
    expect(byteSize.safeParse(2 ** 60).success).toBe(false);
  });
});

describe("parseOrderStatusFilter", () => {
  it("boş veya ALL filtre yok demektir", () => {
    expect(parseOrderStatusFilter(null)).toBeNull();
    expect(parseOrderStatusFilter("")).toBeNull();
    expect(parseOrderStatusFilter("ALL")).toBeNull();
  });
  it("geçerli durumu döner", () => {
    expect(parseOrderStatusFilter("IN_PRODUCTION")).toBe("IN_PRODUCTION");
  });
  it("bilinmeyen veya prototip anahtarı için undefined döner", () => {
    expect(parseOrderStatusFilter("DONE")).toBeUndefined();
    expect(parseOrderStatusFilter("toString")).toBeUndefined();
  });
});
