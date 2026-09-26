import { describe, it, expect } from "vitest";
import { csvCell, toCsv } from "@/lib/csv";

describe("csvCell", () => {
  it("leaves plain text untouched", () => {
    expect(csvCell("rapor.pdf")).toBe("rapor.pdf");
  });

  it("renders null/undefined as an empty cell", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("quotes cells containing commas, quotes or newlines", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('dedi ki "merhaba"')).toBe('"dedi ki ""merhaba"""');
    expect(csvCell("satır1\nsatır2")).toBe('"satır1\nsatır2"');
  });

  it("neutralises formula-looking text (CSV injection)", () => {
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-2")).toBe("'-2");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
  });

  it("does not prefix real numbers (negative numbers stay numeric)", () => {
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell(3.5)).toBe("3.5");
  });

  it("formats dates as ISO strings", () => {
    expect(csvCell(new Date("2026-01-02T03:04:05.000Z"))).toBe("2026-01-02T03:04:05.000Z");
  });
});

describe("toCsv", () => {
  it("starts with a UTF-8 BOM and uses CRLF line endings", () => {
    const out = toCsv(["Ad", "Değer"], [["ğüş", 1], [null, "x,y"]]);
    expect(out).toBe('﻿Ad,Değer\r\nğüş,1\r\n,"x,y"\r\n');
  });
});
