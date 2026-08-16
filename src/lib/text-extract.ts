// Yüklenen dosyanın içeriğinden aranabilir düz metin çıkarır. Sadece
// desteklenen türler için (metin/PDF) — diğerlerinde null döner ve arama
// yalnızca dosya adına düşer. Çıkarım büyük dosyalarda arama indeksini
// şişirmesin diye belli bir karakter sayısında kesilir.
const MAX_CHARS = 200_000;

export async function extractSearchText(buffer: Buffer, mimeType: string): Promise<string | null> {
  try {
    if (mimeType.startsWith("text/") || mimeType === "application/json") {
      return buffer.toString("utf-8").slice(0, MAX_CHARS);
    }
    if (mimeType === "application/pdf") {
      // Yalnızca kullanıldığında yükleniyor (pdf-parse import maliyeti diğer
      // dosya türlerinde gereksiz). pdf-parse 1.x kasıtlı seçildi: 2.x sürümü
      // native `@napi-rs/canvas` bağımlılığı ekliyor, burada gerekmiyor.
      const pdfParse = (await import("pdf-parse")).default;
      const data = await pdfParse(buffer);
      return data.text.slice(0, MAX_CHARS);
    }
    return null;
  } catch {
    // Bozuk/parse edilemeyen dosyalarda yükleme başarısız olmasın —
    // sadece içerik araması o dosya için çalışmaz.
    return null;
  }
}
