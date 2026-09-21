import { describe, it, expect } from "vitest";
import { clampForTextColumn, extractSearchText } from "@/lib/text-extract";

describe("searchText TEXT sütun sınırı", () => {
  it("kısa metni olduğu gibi bırakır", () => {
    expect(clampForTextColumn("merhaba")).toBe("merhaba");
  });
  it("uzun metni 65.535 baytın altına kırpar (çok baytlı karakterlerde de)", () => {
    const long = "ğüşiöçĞÜŞİÖÇ".repeat(20_000); // her karakter 2 bayt
    const out = clampForTextColumn(long);
    expect(Buffer.byteLength(out, "utf8")).toBeLessThanOrEqual(60_000);
    expect(out).not.toContain("�");
  });
  it("büyük metin dosyaları için extractSearchText sınırı aşmaz", async () => {
    const big = Buffer.alloc(500_000, "a");
    const text = await extractSearchText(big, "text/plain");
    expect(Buffer.byteLength(text ?? "", "utf8")).toBeLessThanOrEqual(65_535);
  });
});
