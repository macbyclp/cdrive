// CSV/TSV ayrıştırıcı (önizleme için; istemci ve sunucuda çalışır). RFC 4180: tırnaklı alanlar, tırnak içinde
// ayırıcı/satır sonu/çift tırnak ("") desteklenir. Türkçe Excel'in ";" ayırıcısı otomatik algılanır.

export type ParsedCsv = { rows: string[][]; delimiter: string; truncatedRows: boolean; truncatedCols: boolean };

const CANDIDATES = [",", ";", "\t", "|"];

/** İlk satırlarda (tırnak dışında) en tutarlı sayıda görünen ayırıcıyı seçer; hiçbiri yoksa ",". */
export function detectDelimiter(text: string): string {
  const sample = text.slice(0, 8192).split(/\r?\n/).slice(0, 10).filter((l) => l.length > 0);
  let best = ",";
  let bestScore = 0;
  for (const d of CANDIDATES) {
    const counts = sample.map((line) => {
      let n = 0;
      let inQuotes = false;
      for (const ch of line) {
        if (ch === '"') inQuotes = !inQuotes;
        else if (ch === d && !inQuotes) n++;
      }
      return n;
    });
    if (counts.length === 0 || counts[0] === 0) continue;
    // Tutarlılık: tüm satırlarda aynı sayıda ayırıcı olmalı; ne kadar çoksa o kadar iyi.
    const consistent = counts.filter((c) => c === counts[0]).length / counts.length;
    const score = consistent * counts[0];
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

export function parseCsv(text: string, opts: { maxRows?: number; maxCols?: number; delimiter?: string } = {}): ParsedCsv {
  const maxRows = opts.maxRows ?? 500;
  const maxCols = opts.maxCols ?? 50;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // BOM
  const delimiter = opts.delimiter ?? detectDelimiter(src);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let truncatedRows = false;
  let truncatedCols = false;

  const pushField = () => {
    if (row.length < maxCols) row.push(field);
    else truncatedCols = true;
    field = "";
  };
  const pushRow = () => {
    pushField();
    // Tamamen boş satırı (yalnız ""), dosya sonundaki artık satır sonu için atla.
    if (!(row.length === 1 && row[0] === "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === "") inQuotes = true;
    else if (ch === delimiter) pushField();
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      pushRow();
      if (rows.length >= maxRows) {
        truncatedRows = i < src.length - 1 && src.slice(i + 1).trim().length > 0;
        return { rows, delimiter, truncatedRows, truncatedCols };
      }
    } else field += ch;
  }
  if (field !== "" || row.length > 0) pushRow();
  return { rows, delimiter, truncatedRows, truncatedCols };
}
