// Yüklenen dosyanın içeriğinden aranabilir düz metin çıkarır. Sadece
// desteklenen türler için (metin/PDF) — diğerlerinde null döner ve arama
// yalnızca dosya adına düşer. Çıkarım büyük dosyalarda arama indeksini
// şişirmesin diye belli bir karakter sayısında kesilir.
//
// PDF metni pdfjs-dist (Mozilla'nın kendi kütüphanesi) ile çıkarılıyor —
// "pdf-parse" paketi DENENDİ ama vazgeçildi: paketin içine gömdüğü donmuş,
// çok eski (v1.10.100, ~2017) bir pdf.js derlemesi var; bu, Next.js'in
// modül sistemi içinden (hem dev hem `next start`/standalone prod'da, hem
// statik hem dinamik import ile) çağrıldığında GEÇERLİ PDF'lerde bile sahte
// "bad XRef entry" hatalarıyla patlıyor — sadece çıplak `node script.js`
// içinde plain `require()` ile çalışıyor, yani Next'in herhangi bir modül
// sarmalaması bu paketin eski/prototip-manipülasyonu yapan kodunu bozuyor.
// pdfjs-dist güncel/aktif bakımlı olduğu için bu sorun yok; sadece metin
// çıkarımı (getTextContent) için canvas gerekmiyor — canvas yalnızca sayfa
// render/rasterize ederken gerekir, burada hiç kullanılmıyor.
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const MAX_CHARS = 200_000;

async function textFromPdf(buffer: Buffer): Promise<string> {
  const loadingTask = getDocument({ data: new Uint8Array(buffer) });
  try {
    const doc = await loadingTask.promise;
    let text = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      // getTextContent() satır sonu bilgisi vermez — her metin parçasının
      // transform[5]'i (Y koordinatı) önceki parçayla aynı satırda mı diye
      // karşılaştırılıp değiştiğinde satır sonu ekleniyor (aynı yaklaşım
      // eskiden pdf-parse'ın kendi render_page'inde de kullanılıyordu).
      let lastY: number | undefined;
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const y = item.transform[5];
        if (lastY !== undefined && y !== lastY) text += "\n";
        text += item.str;
        lastY = y;
      }
      text += "\n\n";
      if (text.length > MAX_CHARS) break;
    }
    return text;
  } finally {
    await loadingTask.destroy();
  }
}

export async function extractSearchText(buffer: Buffer, mimeType: string): Promise<string | null> {
  try {
    if (mimeType.startsWith("text/") || mimeType === "application/json") {
      return buffer.toString("utf-8").slice(0, MAX_CHARS);
    }
    if (mimeType === "application/pdf") {
      const text = await textFromPdf(buffer);
      return text.slice(0, MAX_CHARS);
    }
    return null;
  } catch {
    // Bozuk/parse edilemeyen dosyalarda yükleme başarısız olmasın —
    // sadece içerik araması o dosya için çalışmaz.
    return null;
  }
}

export { textFromPdf };
