// pdfkit'in yerleşik (Helvetica vb.) fontları WinAnsiEncoding kullanır; bu kodlamada
// ç/ö/ü var ama Türkçe'ye özgü ğ/ı/ş/İ YOK — harici bir TTF font gömmeden bunlar
// PDF'te bozuk (kutu/soru işareti) çıkar. Bu yüzden yalnızca o dört harfi en yakın
// ASCII karşılığına çeviriyoruz; okunabilirlik için küçük bir ödün, gerçek font gömme
// (Alpine/Docker'da da çalışacak bir TTF dosyası dahil etmek) kadar sağlam değil ama
// hiçbir ek dosya/bağımlılık gerektirmiyor.
const MAP: Record<string, string> = {
  ğ: "g", Ğ: "G",
  ı: "i", İ: "I",
  ş: "s", Ş: "S",
};

export function pdfSafe(text: string): string {
  return text.replace(/[ğĞıİşŞ]/g, (c) => MAP[c] ?? c);
}
