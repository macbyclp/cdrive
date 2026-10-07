// Claude yardımcısı — uygulama tarafı ortak yardımcılar.
//
// Mimari: her kullanıcı kendi Claude API anahtarını Hesap ayarlarından girer (claude-key.ts); ajan döngüsü
// (claude-agent.ts) Anthropic API'sini bu anahtarla çağırır ve araçları (claude-tools.ts) sohbeti başlatan
// kullanıcının YETKİLERİYLE süreç içinde çalıştırır; izinler, kota, denetim kaydı ve sürümleme aynen işler.
// Claude hiçbir dosyaya doğrudan yazmaz: düzenlemeler "öneri" olarak saklanır, kullanıcı onaylayınca yeni sürüm olur.

import AdmZip from "adm-zip";
import ExcelJS from "exceljs";
import { textFromPdf } from "@/lib/text-extract";

// --- Dosya içeriğini okunabilir metne çevirme ---

export const MAX_READ_BYTES = 25 * 1024 * 1024;
export const MAX_READ_CHARS = 60_000;
export const MAX_PROPOSAL_CHARS = 2_000_000;

const EDITABLE_EXT = new Set([
  "txt", "md", "markdown", "csv", "tsv", "json", "xml", "html", "htm", "css", "js", "mjs", "ts", "tsx", "jsx",
  "py", "yml", "yaml", "ini", "log", "sql", "srt", "vtt", "tex", "toml", "env", "sh", "bat", "php",
]);

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i + 1).toLowerCase();
}

/** Düz metin olarak güvenle yeniden yazılabilen türler (Office/PDF gibi ikili biçimler DEĞİL). */
export function isEditableText(name: string, mimeType?: string | null): boolean {
  if (EDITABLE_EXT.has(extOf(name))) return true;
  return !!mimeType && (mimeType.startsWith("text/") || mimeType === "application/json");
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");
}

function xmlText(xml: string, paragraphTag: string): string {
  return decodeXml(
    xml
      .replace(new RegExp(`</${paragraphTag}>`, "g"), "\n")
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<w:br\/>/g, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function zipEntryText(zip: AdmZip, entryName: string, maxBytes = 20 * 1024 * 1024): string | null {
  const entry = zip.getEntry(entryName);
  if (!entry || entry.header.size > maxBytes) return null;
  return zip.readAsText(entry);
}

/**
 * Dosyanın içeriğini Claude'un okuyabileceği düz metne çevirir; desteklenmeyen türde null döner.
 * Metin/JSON/CSV, PDF (metin katmanı), Word (.docx), Excel (.xlsx) ve PowerPoint (.pptx) desteklenir.
 */
export async function readableText(buffer: Buffer, mimeType: string, name: string): Promise<string | null> {
  const ext = extOf(name);
  try {
    if (isEditableText(name, mimeType)) return buffer.toString("utf-8");
    if (mimeType === "application/pdf" || ext === "pdf") return await textFromPdf(buffer);
    if (ext === "docx") {
      const xml = zipEntryText(new AdmZip(buffer), "word/document.xml");
      return xml === null ? null : xmlText(xml, "w:p");
    }
    if (ext === "pptx") {
      const zip = new AdmZip(buffer);
      const slides = zip
        .getEntries()
        .map((e) => e.entryName)
        .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
        .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
      const parts: string[] = [];
      for (const [i, n] of slides.entries()) {
        const xml = zipEntryText(zip, n);
        if (xml) parts.push(`--- Slayt ${i + 1} ---\n${xmlText(xml, "a:p")}`);
      }
      return parts.join("\n\n");
    }
    if (ext === "xlsx") {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer as unknown as ArrayBuffer);
      const parts: string[] = [];
      wb.eachSheet((ws) => {
        const rows: string[] = [`--- Sayfa: ${ws.name} ---`];
        ws.eachRow({ includeEmpty: false }, (row) => {
          const values = (row.values as unknown[]).slice(1).map((v) => {
            if (v === null || v === undefined) return "";
            if (typeof v === "object") {
              const o = v as { text?: string; result?: unknown; richText?: { text: string }[] };
              if (o.richText) return o.richText.map((r) => r.text).join("");
              if (o.text !== undefined) return String(o.text);
              if (o.result !== undefined) return String(o.result);
              return v instanceof Date ? v.toISOString().slice(0, 10) : JSON.stringify(v);
            }
            return String(v);
          });
          rows.push(values.join("\t"));
        });
        parts.push(rows.join("\n"));
      });
      return parts.join("\n\n");
    }
  } catch {
    return null;
  }
  return null;
}
