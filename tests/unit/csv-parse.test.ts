import { describe, it, expect } from "vitest";
import { parseCsv, detectDelimiter } from "@/lib/csv-parse";
import { previewKind } from "@/lib/format";

describe("detectDelimiter", () => {
  it("virgül, noktalı virgül (Türkçe Excel), sekme ve | algılar", () => {
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
    expect(detectDelimiter("ad;soyad;yaş\nAli;Veli;30")).toBe(";");
    expect(detectDelimiter("a\tb\tc\n1\t2\t3")).toBe("\t");
    expect(detectDelimiter("a|b\n1|2")).toBe("|");
  });
  it("tırnak içindeki ayırıcıları saymaz; ayırıcı yoksa virgüle düşer", () => {
    expect(detectDelimiter('"a,b";c\n"d,e";f')).toBe(";");
    expect(detectDelimiter("tek sütun\nbaşka satır")).toBe(",");
  });
});

describe("parseCsv", () => {
  it("temel tablo", () => {
    expect(parseCsv("a,b\n1,2\n3,4").rows).toEqual([["a", "b"], ["1", "2"], ["3", "4"]]);
  });
  it("tırnaklı alan: ayırıcı, satır sonu ve çift tırnak içerebilir", () => {
    const r = parseCsv('ad,not\n"Ali, Veli","satır1\nsatır2"\n"x ""y"" z",ok').rows;
    expect(r[1]).toEqual(["Ali, Veli", "satır1\nsatır2"]);
    expect(r[2]).toEqual(['x "y" z', "ok"]);
  });
  it("CRLF, BOM ve sondaki boş satırı doğru işler", () => {
    expect(parseCsv("﻿a;b\r\n1;2\r\n").rows).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("Türkçe karakterler korunur", () => {
    expect(parseCsv("şehir;ülke\nİstanbul;Türkiye").rows[1]).toEqual(["İstanbul", "Türkiye"]);
  });
  it("boş alanlar ve eksik sütunlar korunur", () => {
    expect(parseCsv("a,b,c\n1,,3\n,,").rows).toEqual([["a", "b", "c"], ["1", "", "3"], ["", "", ""]]);
  });
  it("satır ve sütun sınırı uygulanır ve bildirilir", () => {
    const many = Array.from({ length: 50 }, (_, i) => `${i},x`).join("\n");
    const r = parseCsv(many, { maxRows: 10 });
    expect(r.rows).toHaveLength(10);
    expect(r.truncatedRows).toBe(true);
    const wide = parseCsv("a,b,c,d,e\n1,2,3,4,5", { maxCols: 3 });
    expect(wide.rows[0]).toEqual(["a", "b", "c"]);
    expect(wide.truncatedCols).toBe(true);
  });
  it("tam sığan dosya 'kesildi' sayılmaz", () => {
    expect(parseCsv("a\n1\n2", { maxRows: 3 }).truncatedRows).toBe(false);
  });
  it("boş girdi ve kapanmamış tırnakta çökmez", () => {
    expect(parseCsv("").rows).toEqual([]);
    expect(parseCsv('a,"kapanmamış\nb').rows.length).toBeGreaterThan(0);
  });
});

describe("previewKind — csv", () => {
  it("text/csv ve tsv tablo olarak önizlenir", () => {
    expect(previewKind("text/csv")).toBe("csv");
    expect(previewKind("text/tab-separated-values")).toBe("csv");
  });
  it("Windows'un .csv için gönderdiği application/vnd.ms-excel uzantıdan tanınır", () => {
    expect(previewKind("application/vnd.ms-excel", "liste.csv")).toBe("csv");
    expect(previewKind("application/octet-stream", "liste.TSV")).toBe("csv");
  });
  it("gerçek Excel dosyası (.xls) tabloya çevrilmez; düz metin etkilenmez", () => {
    expect(previewKind("application/vnd.ms-excel", "rapor.xls")).toBe("none");
    expect(previewKind("text/plain", "not.txt")).toBe("text");
    expect(previewKind("application/vnd.ms-excel")).toBe("none");
  });
});
