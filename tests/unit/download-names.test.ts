import { describe, it, expect } from "vitest";
import { safeZipSegment, dedupeZipPath, contentDisposition, fileNameFromDisposition } from "@/lib/download-names";

describe("safeZipSegment (zip slip)", () => {
  it("normal adı değiştirmez", () => {
    expect(safeZipSegment("Teklif 2026.docx")).toBe("Teklif 2026.docx");
  });
  it("yol ayırıcılarını etkisizleştirir", () => {
    expect(safeZipSegment("../../.bashrc")).toBe(".._.._.bashrc");
    expect(safeZipSegment("a\\b/c")).toBe("a_b_c");
  });
  it("'.', '..' ve boş adı '_' yapar", () => {
    expect(safeZipSegment("..")).toBe("_");
    expect(safeZipSegment(".")).toBe("_");
    expect(safeZipSegment("  ")).toBe("_");
  });
  it("kontrol karakterlerini temizler", () => {
    expect(safeZipSegment("a\u0000b\nc")).toBe("a_b_c");
  });
});

describe("dedupeZipPath", () => {
  it("çakışan yolları (büyük/küçük harf duyarsız) ayırır", () => {
    const used = new Set<string>();
    expect(dedupeZipPath("dir/a.txt", used)).toBe("dir/a.txt");
    expect(dedupeZipPath("dir/A.txt", used)).toBe("dir/A (2).txt");
    expect(dedupeZipPath("dir/a.txt", used)).toBe("dir/a (3).txt");
    expect(dedupeZipPath("diger/a.txt", used)).toBe("diger/a.txt");
  });
});

describe("contentDisposition", () => {
  it("ASCII yedek + UTF-8 filename* üretir", () => {
    const h = contentDisposition("attachment", "Çalışma planı.docx");
    expect(h.startsWith('attachment; filename="')).toBe(true);
    expect(h).toContain("filename*=UTF-8''%C3%87al%C4%B1%C5%9Fma%20plan%C4%B1.docx");
    expect(h).not.toMatch(/filename="[^"]*[^\x20-\x7e][^"]*"/);
  });
  it("tırnak ve ters bölü başlığı bozamaz", () => {
    const h = contentDisposition("inline", 'a"b\\c.txt');
    expect(h).toContain('filename="a_b_c.txt"');
  });
  it("fileNameFromDisposition ile gidiş-dönüş", () => {
    for (const n of ["Çalışma planı.docx", "rapor (v2).pdf", "it's.txt"]) {
      expect(fileNameFromDisposition(contentDisposition("attachment", n))).toBe(n);
    }
  });
});

describe("fileNameFromDisposition", () => {
  it("yalnız filename olan eski biçimi okur", () => {
    expect(fileNameFromDisposition('attachment; filename="a.txt"')).toBe("a.txt");
  });
  it("başlık yoksa null", () => {
    expect(fileNameFromDisposition(null)).toBeNull();
  });
});
