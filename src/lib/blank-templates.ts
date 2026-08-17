import { Document, Packer, Paragraph } from "docx";
import ExcelJS from "exceljs";
import PptxGenJS from "pptxgenjs";

/**
 * "+ Yeni" menüsünden boş Word/Excel/PowerPoint belgesi oluşturma. OnlyOffice
 * Document Server'a bağımlı DEĞİL — belge OnlyOffice olmadan da oluşturulup
 * indirilebilir; sadece tarayıcıda DÜZENLEMEK için Document Server gerekir.
 */
export type BlankKind = "docx" | "xlsx" | "pptx" | "txt";

export const BLANK_KIND_INFO: Record<BlankKind, { label: string; mimeType: string; defaultName: string }> = {
  docx: {
    label: "Word belgesi",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    defaultName: "Adsız belge.docx",
  },
  xlsx: {
    label: "Excel tablosu",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    defaultName: "Adsız tablo.xlsx",
  },
  pptx: {
    label: "PowerPoint sunumu",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    defaultName: "Adsız sunum.pptx",
  },
  txt: {
    label: "Metin dosyası",
    mimeType: "text/plain",
    defaultName: "Adsız dosya.txt",
  },
};

async function blankDocxBuffer(): Promise<Buffer> {
  const doc = new Document({ sections: [{ children: [new Paragraph("")] }] });
  return Packer.toBuffer(doc);
}

async function blankXlsxBuffer(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet("Sayfa1");
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

async function blankPptxBuffer(): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.addSlide();
  const out = await pptx.write({ outputType: "nodebuffer" });
  return out as Buffer;
}

function blankTxtBuffer(): Buffer {
  return Buffer.from("", "utf-8");
}

export async function generateBlankFile(kind: BlankKind): Promise<Buffer> {
  if (kind === "docx") return blankDocxBuffer();
  if (kind === "xlsx") return blankXlsxBuffer();
  if (kind === "txt") return blankTxtBuffer();
  return blankPptxBuffer();
}
