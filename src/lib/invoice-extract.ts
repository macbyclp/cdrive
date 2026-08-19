// Muhasebe bir siparişe resmi fatura eklediğinde, faturadan adres/vergi no/vergi
// dairesi/telefon/e-posta gibi alanları otomatik okumaya çalışır. İki kaynak
// desteklenir:
//   - Dijital PDF (gerçek, seçilebilir metin katmanı olan) → pdfjs-dist ile doğrudan metin
//     (bkz. src/lib/text-extract.ts'teki textFromPdf — aynı fonksiyon burada da kullanılıyor).
//   - Fotoğraf/taranmış görsel (jpg/png/webp) → tesseract.js ile OCR (tur+eng).
// "Taranmış PDF" (metin katmanı olmayan, sadece görüntüden oluşan PDF) desteklenmiyor —
// bunun için PDF sayfasını rasterize edip OCR'lamak gerekir, kasıtlı olarak kapsam dışı
// bırakıldı (ek native bağımlılık/karmaşıklık).
//
// Çıkarım en iyi çaba (best-effort) sezgisel regex'lerle yapılır — OCR/serbest metinden
// %100 doğru alan ayrıştırma garantisi yoktur. Bu yüzden çağıran taraf (PATCH
// /api/orders/[id]) sadece o an BOŞ olan Customer alanlarını doldurur, var olan/elle
// girilmiş veriyi asla otomatik ezmez.

import { textFromPdf } from "@/lib/text-extract";

const MIN_PDF_TEXT_LENGTH = 40; // Bunun altındaysa PDF'te gerçek metin katmanı yok say.

export type ExtractedInvoiceFields = {
  address: string | null;
  taxNumber: string | null;
  taxOffice: string | null;
  phone: string | null;
  email: string | null;
};

const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

export function isExtractableMime(mimeType: string): boolean {
  return mimeType === "application/pdf" || IMAGE_MIME_TYPES.has(mimeType);
}

async function ocrImage(buffer: Buffer): Promise<string> {
  // Yalnızca kullanıldığında yükleniyor — tesseract.js worker başlatma maliyeti
  // (dil verisi indirme dahil) diğer dosya türlerinde gereksiz.
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(["tur", "eng"]);
  try {
    const {
      data: { text },
    } = await worker.recognize(buffer);
    return text;
  } finally {
    await worker.terminate();
  }
}

function extractTaxNumber(text: string): string | null {
  // Türkiye'de VKN (vergi kimlik no) 10 hane. "Vergi No", "VKN", "V.No" etiketleriyle
  // birlikte geçer; etiket bulunamazsa metindeki ilk 10 haneli sayı bulunur.
  const labeled = text.match(/(?:vergi\s*(?:kimlik)?\s*no|vkn|v\.?\s*no)\s*[:.]?\s*(\d{10})/i);
  if (labeled) return labeled[1];
  const bare = text.match(/\b\d{10}\b/);
  return bare ? bare[0] : null;
}

function extractTaxOffice(text: string): string | null {
  const m = text.match(/vergi\s*dairesi\s*[:.]?\s*([^\n,]{2,60})/i);
  return m ? m[1].trim() : null;
}

const PHONE_PATTERN = /(?:\+?90[\s.-]?)?0?\s?\(?(?:5\d{2}|2\d{2}|3\d{2}|4\d{2})\)?[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}/;

function extractPhone(text: string): string | null {
  // Önce "Tel:"/"Telefon:"/"Phone:" etiketinden sonraki numarayı ara — etiketsiz arama
  // vergi no gibi 10 haneli başka sayıları da yanlışlıkla telefon sanabiliyor (ikisi de
  // aynı sayı deseniyle eşleşiyor). Etiket bulunamazsa son çare olarak bare pattern denenir.
  const labeled = text.match(new RegExp(`(?:tel(?:efon)?|phone)\\s*[:.]?\\s*(${PHONE_PATTERN.source})`, "i"));
  if (labeled) return labeled[1].replace(/\s+/g, " ").trim();
  const bare = text.match(PHONE_PATTERN);
  return bare ? bare[0].replace(/\s+/g, " ").trim() : null;
}

function extractEmail(text: string): string | null {
  const m = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return m ? m[0] : null;
}

function extractAddress(text: string): string | null {
  // "Adres:" etiketinden sonraki satırı al; yoksa tipik adres anahtar kelimeleri
  // (Mahalle/Cadde/Sokak/No) içeren en uzun satırı sezgisel olarak dene.
  const labeled = text.match(/adres\s*[:.]?\s*([^\n]{5,180})/i);
  if (labeled) return labeled[1].trim();

  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const addressKeywords = /(mahalle|mah\.|cadde|cad\.|sokak|sok\.|no\s*:|apt\.|kat\s*:|\/\d)/i;
  const candidate = lines.filter((l) => addressKeywords.test(l)).sort((a, b) => b.length - a.length)[0];
  return candidate ?? null;
}

/**
 * Bir fatura dosyasından (PDF veya fotoğraf) yukarıdaki alanları çıkarmaya çalışır.
 * Desteklenmeyen dosya türünde veya hiçbir alan bulunamazsa null döner — çağıran taraf
 * bunu sessizce yok saymalı, hata fırlatmamalı (ek dosya ekleme akışını bozmasın).
 */
export async function extractInvoiceFields(buffer: Buffer, mimeType: string): Promise<ExtractedInvoiceFields | null> {
  let text: string;
  try {
    if (mimeType === "application/pdf") {
      text = await textFromPdf(buffer);
      if (text.trim().length < MIN_PDF_TEXT_LENGTH) {
        // Muhtemelen taranmış (görüntü tabanlı) bir PDF — desteklenmiyor, bkz. üstteki not.
        return null;
      }
    } else if (IMAGE_MIME_TYPES.has(mimeType)) {
      text = await ocrImage(buffer);
    } else {
      return null;
    }
  } catch {
    // Bozuk/okunamayan dosyada ek ekleme akışı bozulmasın — sessizce vazgeç.
    return null;
  }

  const fields: ExtractedInvoiceFields = {
    address: extractAddress(text),
    taxNumber: extractTaxNumber(text),
    taxOffice: extractTaxOffice(text),
    phone: extractPhone(text),
    email: extractEmail(text),
  };

  const foundAny = Object.values(fields).some((v) => v !== null);
  return foundAny ? fields : null;
}
