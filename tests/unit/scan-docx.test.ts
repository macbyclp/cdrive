import { describe, expect, it } from "vitest";
import AdmZip from "adm-zip";
import { buildDocxFromPages, paragraphsFromOcr } from "@/lib/scan-docx";

describe("paragraphsFromOcr", () => {
  it("boş satırla ayrılan blokları paragraf yapar, satır sonlarını korur", () => {
    expect(paragraphsFromOcr("Başlık\n\nSatır 1\nSatır 2\r\n\r\n  \nSon")).toEqual([
      ["Başlık"],
      ["Satır 1", "Satır 2"],
      ["Son"],
    ]);
  });
});

describe("buildDocxFromPages", () => {
  it("metni düzenlenebilir docx içine koyar ve sayfalar arasına sayfa sonu ekler", async () => {
    const buf = await buildDocxFromPages(["Merhaba dünya\n\nİkinci paragraf", "Sayfa iki"]);
    expect(buf.subarray(0, 2).toString()).toBe("PK");
    const xml = new AdmZip(buf).readAsText("word/document.xml");
    expect(xml).toContain("Merhaba dünya");
    expect(xml).toContain("Sayfa iki");
    expect(xml).toContain("w:pageBreakBefore");
  });
});
