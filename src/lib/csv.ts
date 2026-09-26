/**
 * Küçük, bağımlılıksız CSV üretici (RFC 4180).
 *
 * İki önemli ayrıntı:
 * - Excel'in Türkçe karakterleri doğru açması için çıktı UTF-8 BOM ile başlar.
 * - "CSV/formül enjeksiyonu": `=`, `+`, `-`, `@`, sekme veya CR ile başlayan bir hücre
 *   Excel/LibreOffice'te FORMÜL olarak çalıştırılabilir. Denetim kaydındaki `detail`
 *   gibi alanlar kullanıcı girdisi (dosya adı vb.) taşıdığı için bu hücrelerin başına
 *   tek tırnak eklenir; değer metin olarak kalır.
 */

export type CsvValue = string | number | boolean | Date | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  let s: string;
  if (value instanceof Date) s = value.toISOString();
  else if (typeof value === "number" || typeof value === "boolean") return String(value);
  else s = value;
  if (FORMULA_START.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Başlık satırı + veri satırlarından BOM'lu, CRLF satır sonlu bir CSV metni üretir. */
export function toCsv(header: string[], rows: CsvValue[][]): string {
  const lines = [header, ...rows].map((r) => r.map(csvCell).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}
