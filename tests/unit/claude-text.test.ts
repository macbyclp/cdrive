import { describe, expect, it } from "vitest";
import { Document, Packer, Paragraph, TextRun } from "docx";
import ExcelJS from "exceljs";
import PptxGenJS from "pptxgenjs";
import { extOf, isEditableText, readableText } from "@/lib/claude";

describe("isEditableText", () => {
  it("düz metin türleri düzenlenebilir; Office/PDF/görsel değil", () => {
    for (const n of ["a.txt", "b.MD", "c.csv", "d.json", "e.html", "f.ts", "g.yaml"]) expect(isEditableText(n)).toBe(true);
    for (const n of ["a.docx", "b.xlsx", "c.pdf", "d.png", "e.pptx", "f.zip", "g.exe"]) expect(isEditableText(n)).toBe(false);
    expect(isEditableText("uzantisiz", "text/plain")).toBe(true);
    expect(isEditableText("uzantisiz", "application/octet-stream")).toBe(false);
    expect(extOf("a.b.TXT")).toBe("txt");
  });
});

describe("readableText", () => {
  it("düz metni olduğu gibi okur", async () => {
    expect(await readableText(Buffer.from("merhaba dünya"), "text/plain", "a.txt")).toBe("merhaba dünya");
  });

  it("Word (.docx) paragraflarını okur", async () => {
    const doc = new Document({
      sections: [{ children: [new Paragraph({ children: [new TextRun("Birinci paragraf & özel <karakter>")] }), new Paragraph("İkinci paragraf")] }],
    });
    const text = await readableText(await Packer.toBuffer(doc), "application/octet-stream", "rapor.docx");
    expect(text).toContain("Birinci paragraf & özel <karakter>");
    expect(text).toContain("İkinci paragraf");
    expect(text!.indexOf("Birinci")).toBeLessThan(text!.indexOf("İkinci"));
  });

  it("Excel (.xlsx) sayfalarını ve hücreleri okur", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Bütçe");
    ws.addRow(["Kalem", "Tutar"]);
    ws.addRow(["Kira", 15000]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const text = await readableText(buf, "application/octet-stream", "butce.xlsx");
    expect(text).toContain("Sayfa: Bütçe");
    expect(text).toContain("Kira\t15000");
  });

  it("PowerPoint (.pptx) slayt metinlerini okur", async () => {
    const pptx = new PptxGenJS();
    pptx.addSlide().addText("Açılış slaytı", { x: 1, y: 1 });
    pptx.addSlide().addText("İkinci slayt", { x: 1, y: 1 });
    const buf = Buffer.from((await pptx.write({ outputType: "nodebuffer" })) as Buffer);
    const text = await readableText(buf, "application/octet-stream", "sunum.pptx");
    expect(text).toContain("Slayt 1");
    expect(text).toContain("Açılış slaytı");
    expect(text).toContain("İkinci slayt");
  });

  it("desteklenmeyen/bozuk içerikte çökmez, null döner", async () => {
    expect(await readableText(Buffer.from("PNG..."), "image/png", "a.png")).toBeNull();
    expect(await readableText(Buffer.from("bozuk"), "application/octet-stream", "x.docx")).toBeNull();
    expect(await readableText(Buffer.from("bozuk"), "application/octet-stream", "x.xlsx")).toBeNull();
  });
});
