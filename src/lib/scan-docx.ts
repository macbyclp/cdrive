// Belge tarayıcı: OCR ile okunan sayfa metinlerinden düzenlenebilir bir Word (.docx) belgesi üretir.
// OCR düzen/tablo/görsel bilgisi vermez; her sayfa metni paragraflara (boş satırla ayrılmış bloklar)
// bölünür, blok içi satır sonları korunur ve sayfalar arasına sayfa sonu konur.

import { Document, Packer, Paragraph, TextRun } from "docx";

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function paragraphsFromOcr(text: string): string[][] {
  return text
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .map((block) =>
      block
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
    )
    .filter((lines) => lines.length > 0);
}

export function buildDocxFromPages(pageTexts: string[]): Promise<Buffer> {
  const children: Paragraph[] = [];
  pageTexts.forEach((text, pageIndex) => {
    const blocks = paragraphsFromOcr(text);
    if (blocks.length === 0) blocks.push([""]);
    blocks.forEach((lines, i) => {
      children.push(
        new Paragraph({
          pageBreakBefore: pageIndex > 0 && i === 0,
          spacing: { after: 160 },
          children: lines.map((line, li) => new TextRun({ text: line, break: li > 0 ? 1 : 0 })),
        })
      );
    });
  });
  return Packer.toBuffer(new Document({ sections: [{ children }] }));
}
