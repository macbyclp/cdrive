// Belge tarayıcı: istemcinin gönderdiği sayfa görüntülerinden (JPEG/PNG) tek bir PDF üretir.
// Her sayfa, görüntünün en-boy oranını koruyarak A4 sınırlarına sığdırılır; görüntü yeniden
// kodlanmadan doğrudan PDF'e gömülür (pdfkit JPEG/PNG'yi olduğu gibi embed eder).

import PDFDocument from "pdfkit";

export const MAX_SCAN_PAGES = 40;
export const MAX_SCAN_PAGE_BYTES = 15 * 1024 * 1024;

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

export class ScanError extends Error {
  status = 400;
}

export function detectImageType(buf: Buffer): "jpeg" | "png" | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "png";
  }
  return null;
}

export function buildPdfFromImages(images: Buffer[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ autoFirstPage: false, margin: 0 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      for (const img of images) {
        const opened = (doc as unknown as { openImage(src: Buffer): { width: number; height: number } }).openImage(img);
        const landscape = opened.width > opened.height;
        const pageW = landscape ? A4_HEIGHT : A4_WIDTH;
        const pageH = landscape ? A4_WIDTH : A4_HEIGHT;
        const scale = Math.min(pageW / opened.width, pageH / opened.height);
        const w = opened.width * scale;
        const h = opened.height * scale;
        doc.addPage({ size: [pageW, pageH], margin: 0 });
        doc.image(img, (pageW - w) / 2, (pageH - h) / 2, { width: w, height: h });
      }
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}
