/**
 * Cdrive "/" kökünde değil "calapverdi.tr/cdrive" gibi bir ALT-YOLDA çalışıyor
 * (next.config.ts'teki basePath). Next.js `<Link>`/`useRouter()` gibi kendi
 * navigasyon API'leri bu öneki otomatik ekler, ama ham `fetch("/api/...")`,
 * `window.open("/...")`, `<a href="/...">` gibi elle yazılmış mutlak yollar
 * EKLEMEZ — bu yüzden onları bu yardımcıyla sarmalıyoruz.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function withBasePath(path: string) {
  if (!BASE_PATH) return path;
  if (/^https?:\/\//.test(path)) return path; // mutlak URL — dokunma
  if (path.startsWith(BASE_PATH)) return path; // zaten önekli
  return `${BASE_PATH}${path}`;
}
