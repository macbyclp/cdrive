import { describe, it, expect } from "vitest";
import AdmZip from "adm-zip";
import { inspectZipEntries, isSafeZipSegment, safeZipPath, zipMaxTotalBytes, ZIP_MAX_ENTRIES } from "@/lib/zip-guard";

const file = (size: number, compressedSize = size) => ({ isDirectory: false, size, compressedSize });
const MB = 1024 * 1024;

describe("inspectZipEntries", () => {
  it("normal arşivi kabul eder", () => {
    expect(inspectZipEntries([file(1000), file(5 * MB, 4 * MB), { isDirectory: true, size: 0, compressedSize: 0 }], 100 * MB)).toBeNull();
  });

  it("girdi sayısı sınırını aşanı reddeder", () => {
    const many = Array.from({ length: ZIP_MAX_ENTRIES + 1 }, () => file(1));
    expect(inspectZipEntries(many, 100 * MB)).toMatch(/en fazla/);
  });

  it("ilan edilen toplam boyut sınırını aşanı reddeder", () => {
    expect(inspectZipEntries([file(60 * MB), file(60 * MB)], 100 * MB)).toMatch(/büyük/);
  });

  it("zip bombası oranını (1 MB üstü, >200x) yakalar", () => {
    expect(inspectZipEntries([file(500 * MB, 1 * MB)], 10 * 1024 * MB)).toMatch(/şüpheli/);
  });

  it("küçük ama çok sıkışan dosyaya (≤1 MB) oran kuralı uygulanmaz", () => {
    expect(inspectZipEntries([file(MB, 100)], 100 * MB)).toBeNull();
  });

  it("klasör girdileri toplama sayılmaz", () => {
    expect(inspectZipEntries([{ isDirectory: true, size: 999 * MB, compressedSize: 1 }], 1 * MB)).toBeNull();
  });
});

describe("yol güvenliği (zip slip)", () => {
  it("'.', '..' ve boş parçalar güvensizdir", () => {
    for (const s of ["", ".", ".."]) expect(isSafeZipSegment(s)).toBe(false);
    expect(isSafeZipSegment("belge.pdf")).toBe(true);
  });

  it("safeZipPath üst dizine çıkışı ve ters eğik çizgiyi temizler", () => {
    expect(safeZipPath("../../etc/passwd")).toEqual(["etc", "passwd"]);
    expect(safeZipPath("a\\..\\b/c.txt")).toEqual(["a", "b", "c.txt"]);
    expect(safeZipPath("/mutlak/yol.txt")).toEqual(["mutlak", "yol.txt"]);
  });
});

describe("zipMaxTotalBytes", () => {
  it("varsayılan 2 GiB; geçerli env değeri kullanılır; bozuk değerde varsayılana düşer", () => {
    expect(zipMaxTotalBytes({} as NodeJS.ProcessEnv)).toBe(2 * 1024 * MB);
    expect(zipMaxTotalBytes({ ZIP_MAX_TOTAL_BYTES: "1000" } as unknown as NodeJS.ProcessEnv)).toBe(1000);
    expect(zipMaxTotalBytes({ ZIP_MAX_TOTAL_BYTES: "abc" } as unknown as NodeJS.ProcessEnv)).toBe(2 * 1024 * MB);
  });
});

describe("gerçek adm-zip girdileriyle", () => {
  it("yüksek oranda sıkışan gerçek bir arşivi şüpheli bulur", () => {
    const zip = new AdmZip();
    zip.addFile("bomba.bin", Buffer.alloc(300 * MB)); // sıfırlar: ~1000x sıkışır
    const parsed = new AdmZip(zip.toBuffer());
    const info = parsed.getEntries().map((e) => ({ isDirectory: e.isDirectory, size: e.header.size, compressedSize: e.header.compressedSize }));
    expect(inspectZipEntries(info, 10 * 1024 * MB)).toMatch(/şüpheli/);
  }, 60000);
});
