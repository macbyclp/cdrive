// Belge tarayıcı için istemci tarafı görüntü işleme (canvas): boyut küçültme, döndürme ve
// "belge" / "siyah-beyaz" iyileştirme. Saf DOM/canvas — sunucuda çalışmaz.

export type ScanFilter = "original" | "document" | "bw";

export const MAX_SIDE = 2200;

/** Kaynağı (video karesi / görsel) en uzun kenarı MAX_SIDE olacak şekilde canvas'a alır. */
export function toSourceCanvas(src: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * scale));
  c.height = Math.max(1, Math.round(h * scale));
  c.getContext("2d")!.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

function otsu(hist: Uint32Array, total: number): number {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += i * hist[i];
    const between = wB * wF * (sumB / wB - (sum - sumB) / wF) ** 2;
    if (between > best) {
      best = between;
      threshold = i;
    }
  }
  return threshold;
}

/** Döndürme (90° adımlarla) + filtre uygulanmış yeni bir canvas döner. maxSide ile küçültülebilir. */
export function renderPage(
  source: HTMLCanvasElement,
  rotation: number,
  filter: ScanFilter,
  maxSide = MAX_SIDE
): HTMLCanvasElement {
  const quarter = ((rotation % 360) + 360) % 360;
  const swap = quarter === 90 || quarter === 270;
  const sw = source.width;
  const sh = source.height;
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const dw = Math.max(1, Math.round(sw * scale));
  const dh = Math.max(1, Math.round(sh * scale));
  const out = document.createElement("canvas");
  out.width = swap ? dh : dw;
  out.height = swap ? dw : dh;
  const ctx = out.getContext("2d", { willReadFrequently: true })!;
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((quarter * Math.PI) / 180);
  ctx.drawImage(source, -dw / 2, -dh / 2, dw, dh);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (filter === "original") return out;

  const img = ctx.getImageData(0, 0, out.width, out.height);
  const d = img.data;
  const n = d.length / 4;
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) {
    const g = Math.round(0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]);
    d[i * 4] = g; // geçici olarak gri değeri R kanalında tut
    hist[g]++;
  }
  // Levels: kâğıt zemin baskın olduğundan medyan gri değeri "beyaz" kabul edilir (zemini beyaza
  // çeker); en koyu %0,2'lik dilim "siyah" olur. Yazı piksel oranı düşük olduğu için yüzdelik
  // aralığı yazıyı da beyaza taşıyabilir — bu yüzden beyaz noktası üst uç yerine medyandan alınır.
  let acc = 0;
  let lo = 0;
  while (lo < 255 && (acc += hist[lo]) < n * 0.002) lo++;
  acc = 0;
  let hi = 0;
  while (hi < 255 && (acc += hist[hi]) < n * 0.5) hi++;
  if (hi - lo < 32) hi = Math.min(255, lo + 32);
  const range = Math.max(1, hi - lo);
  const levelled = new Uint32Array(256);
  for (let i = 0; i < n; i++) {
    const v = Math.max(0, Math.min(255, Math.round(((d[i * 4] - lo) / range) * 255)));
    d[i * 4] = v;
    levelled[v]++;
  }
  const t = filter === "bw" ? otsu(levelled, n) : -1;
  for (let i = 0; i < n; i++) {
    let v = d[i * 4];
    if (t >= 0) v = v > t ? 255 : 0;
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
    d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

export function canvasToJpeg(c: HTMLCanvasElement, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", quality)
  );
}
