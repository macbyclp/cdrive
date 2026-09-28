import { describe, expect, it } from "vitest";
import { buildPdfFromImages, detectImageType } from "@/lib/scan-pdf";

// 1x1 piksellik geçerli PNG
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

describe("detectImageType", () => {
  it("PNG ve JPEG imzalarını tanır, diğerlerini reddeder", () => {
    expect(detectImageType(PNG_1X1)).toBe("png");
    expect(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe("jpeg");
    expect(detectImageType(Buffer.from("%PDF-1.4 ...."))).toBeNull();
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
  });
});

describe("buildPdfFromImages", () => {
  it("her görüntü için bir sayfalık geçerli PDF üretir", async () => {
    const pdf = await buildPdfFromImages([PNG_1X1, PNG_1X1, PNG_1X1]);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.toString("latin1").match(/\/Type \/Page\b/g)?.length).toBe(3);
  });
});
