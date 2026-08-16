import { describe, it, expect } from "vitest";
import { formatBytesStr, previewKind, iconForMime, badgeColorForMime } from "@/lib/format";

describe("formatBytesStr", () => {
  it("formats bytes without decimals", () => {
    expect(formatBytesStr(500)).toBe("500 B");
  });

  it("formats kilobytes with one decimal (values under 10 units always show a decimal)", () => {
    expect(formatBytesStr(2048)).toBe("2.0 KB");
  });

  it("formats with one decimal below 10 units", () => {
    expect(formatBytesStr(1536)).toBe("1.5 KB");
  });

  it("formats gigabytes without decimal when >= 10", () => {
    expect(formatBytesStr(15 * 1024 ** 3)).toBe("15 GB");
  });

  it("accepts string input (as returned by the API for BigInt fields)", () => {
    expect(formatBytesStr("1048576")).toBe("1.0 MB");
  });

  it("caps at TB (does not overflow to a nonexistent unit)", () => {
    expect(formatBytesStr(5 * 1024 ** 5)).toBe("5120 TB");
  });
});

describe("previewKind", () => {
  it("classifies images", () => {
    expect(previewKind("image/png")).toBe("image");
  });
  it("classifies PDFs", () => {
    expect(previewKind("application/pdf")).toBe("pdf");
  });
  it("classifies plain text and JSON as text", () => {
    expect(previewKind("text/plain")).toBe("text");
    expect(previewKind("application/json")).toBe("text");
  });
  it("falls back to none for unsupported types", () => {
    expect(previewKind("application/zip")).toBe("none");
  });
});

describe("iconForMime / badgeColorForMime", () => {
  it("never returns the folder emoji for a file (regression: generic files used to look like folders)", () => {
    expect(iconForMime("text/plain")).not.toBe("📁");
    expect(iconForMime("application/octet-stream")).not.toBe("📁");
  });

  it("gives text files a distinct icon from other generic files", () => {
    expect(iconForMime("text/plain")).toBe("📝");
    expect(iconForMime("application/octet-stream")).toBe("📄");
  });

  it("returns a stable, deterministic color per category", () => {
    expect(badgeColorForMime("image/jpeg")).toBe(badgeColorForMime("image/png"));
    expect(badgeColorForMime("application/pdf")).not.toBe(badgeColorForMime("image/png"));
  });
});
