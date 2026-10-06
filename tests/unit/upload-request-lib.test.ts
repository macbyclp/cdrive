import { describe, it, expect } from "vitest";
import { uploadRequestStatus, sanitizeUploadName, uniqueName } from "@/lib/upload-request";

const base = { revoked: false, expiresAt: new Date("2030-01-01"), maxFiles: 3, uploadCount: 0 };

describe("uploadRequestStatus", () => {
  it("açık istek kabul eder", () => {
    expect(uploadRequestStatus(base, new Date("2026-01-01"))).toEqual({ ok: true });
  });
  it("yok / iptal → 404", () => {
    expect(uploadRequestStatus(null)).toMatchObject({ ok: false, reason: "revoked", status: 404 });
    expect(uploadRequestStatus({ ...base, revoked: true })).toMatchObject({ ok: false, status: 404 });
  });
  it("süresi dolmuş → 410", () => {
    expect(uploadRequestStatus({ ...base, expiresAt: new Date("2026-01-01") }, new Date("2026-06-01"))).toMatchObject({ reason: "expired", status: 410 });
  });
  it("kontenjan dolmuş → 410", () => {
    expect(uploadRequestStatus({ ...base, uploadCount: 3 })).toMatchObject({ reason: "full", status: 410 });
    expect(uploadRequestStatus({ ...base, uploadCount: 2 })).toEqual({ ok: true });
  });
});

describe("sanitizeUploadName", () => {
  it("yol ayırıcıları ve denetim karakterlerini temizler", () => {
    expect(sanitizeUploadName("../../etc/passwd")).toBe(".._.._etc_passwd");
    expect(sanitizeUploadName("a\\b.txt")).toBe("a_b.txt");
    expect(sanitizeUploadName("ra\u0000po\nr.pdf")).toBe("rapor.pdf");
  });
  it("'.', '..' ve boş ad için yedek ad", () => {
    for (const n of ["", ".", "..", "   ", "\u0001"]) expect(sanitizeUploadName(n)).toBe("dosya");
  });
  it("çok uzun adı uzantıyı koruyarak kısaltır", () => {
    const n = sanitizeUploadName("x".repeat(300) + ".pdf");
    expect(n.length).toBe(200);
    expect(n.endsWith(".pdf")).toBe(true);
  });
  it("Türkçe harfleri korur", () => {
    expect(sanitizeUploadName("Şirket özeti İÇ.docx")).toBe("Şirket özeti İÇ.docx");
  });
});

describe("uniqueName", () => {
  it("çakışma yoksa adı değiştirmez", () => {
    expect(uniqueName("a.pdf", ["b.pdf"])).toBe("a.pdf");
  });
  it("çakışmada (2), (3)… ekler ve uzantıyı korur", () => {
    expect(uniqueName("rapor.pdf", ["rapor.pdf"])).toBe("rapor (2).pdf");
    expect(uniqueName("rapor.pdf", ["rapor.pdf", "rapor (2).pdf"])).toBe("rapor (3).pdf");
  });
  it("uzantısız ve noktayla başlayan adları doğru işler", () => {
    expect(uniqueName("README", ["README"])).toBe("README (2)");
    expect(uniqueName(".env", [".env"])).toBe(".env (2)");
  });
});
