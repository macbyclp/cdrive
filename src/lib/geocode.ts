// Adresi enlem/boylama çevirir — OpenStreetMap Nominatim (ücretsiz, API anahtarı
// gerekmez) kullanılıyor. Nominatim'in kullanım politikası saniyede en fazla 1
// istek ve tanımlayıcı bir User-Agent şart koşuyor; bu yüzden çağıran taraf
// (bkz. src/app/api/orders/[id]/route.ts) sonucu HER ZAMAN Customer.lat/lng'de
// önbelleğe alıp aynı müşteri için bir daha asla sormamalı.

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

export type GeoPoint = { lat: number; lng: number };

export async function geocodeAddress(address: string): Promise<GeoPoint | null> {
  const trimmed = address.trim();
  if (!trimmed) return null;
  try {
    const url = `${NOMINATIM_URL}?format=json&limit=1&q=${encodeURIComponent(trimmed)}`;
    const res = await fetch(url, {
      headers: {
        // Nominatim kullanım politikası: tanımlanabilir bir User-Agent zorunlu.
        // ÖNEMLİ: HTTP header değerleri ASCII/Latin-1 olmak zorunda — Türkçe "ı/ş/ğ"
        // gibi karakterler burada "ByteString'e çevrilemez" hatasıyla fetch'i anında
        // patlatıyordu (gerçek çalışan sunucuda yakalandı), o yüzden bilerek düz ASCII.
        "User-Agent": "Cdrive/1.0 (corporate file platform, internal use)",
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { lat: string; lon: string }[];
    const first = data[0];
    if (!first) return null;
    const lat = Number(first.lat);
    const lng = Number(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    // Ağ hatası/timeout/rate-limit — sessizce vazgeç, bu yüzden ana akış
    // (fatura eki ekleme) asla başarısız olmasın.
    return null;
  }
}
