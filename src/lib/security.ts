// Güvenlik sertleştirmesi için küçük, saf (test edilebilir) yardımcılar.

/**
 * Tarayıcıda `inline` (sayfa içinde açılan) sunulmasında güvenli sayılan türler. Bunların dışındaki
 * her tür (HTML, SVG, XML, JS…) `attachment` olarak indirilir; aksi halde yüklenen bir HTML/SVG
 * dosyası uygulamayla AYNI origin'de çalışıp oturum çalabilirdi (stored XSS).
 */
const INLINE_SAFE = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/bmp",
  "application/pdf",
  "text/plain",
]);

export function isInlineSafeMime(mimeType: string | null | undefined): boolean {
  if (!mimeType) return false;
  const base = mimeType.split(";")[0].trim().toLowerCase();
  if (INLINE_SAFE.has(base)) return true;
  // Medya oynatma (video/ses) için; aktif içerik taşımaz.
  return base.startsWith("video/") || base.startsWith("audio/");
}

/** PNG (IHDR) veya JPEG (SOF) başlığından piksel boyutlarını okur; çözülemezse null. */
export function imageDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1];
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
        i += 2;
        continue;
      }
      const len = buf.readUInt16BE(i + 2);
      // SOF0..SOF15 (DHT=C4, JPG=C8, DAC=CC hariç) çerçeve boyutunu taşır.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  }
  return null;
}

/** Şablon/örnek sır değerlerini yakalar ("replace-with-…", "change-me" vb.). */
export function isPlaceholderSecret(value: string | null | undefined): boolean {
  if (!value) return false;
  return /replace-with|changeme|change-me|your-secret|example|insecure-dev/i.test(value);
}

/**
 * OnlyOffice Document Server'ın callback'te verdiği indirme adresinin, güvenilen Document Server
 * origin'inde olduğunu doğrular (SSRF'yi engeller). Ek origin'ler ONLYOFFICE_ALLOWED_ORIGINS
 * ile (virgülle) verilebilir — Document Server dahili bir adres bildiriyorsa.
 */
export function isTrustedOnlyOfficeUrl(rawUrl: string, env: NodeJS.ProcessEnv = process.env): boolean {
  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return false;
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") return false;
  const allowed = new Set<string>();
  for (const candidate of [env.ONLYOFFICE_URL, ...(env.ONLYOFFICE_ALLOWED_ORIGINS?.split(",") ?? [])]) {
    const v = candidate?.trim();
    if (!v) continue;
    try {
      allowed.add(new URL(v).origin);
    } catch {
      /* geçersiz yapılandırma değeri yok sayılır */
    }
  }
  return allowed.has(target.origin);
}

/** Yanıt gövdesini en çok `maxBytes` bayt okur; aşarsa hata fırlatır (bellek tüketimini sınırlar). */
export async function readBodyLimited(res: Response, maxBytes: number): Promise<Buffer> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error("İçerik çok büyük");
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Error("İçerik çok büyük");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}
