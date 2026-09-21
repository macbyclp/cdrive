import { Readable } from "stream";
import { openReadStream, statFile } from "@/lib/storage";

export type ByteRange = { start: number; end: number };

/**
 * Tek aralıklı `Range: bytes=...` başlığını çözer (kapsayıcı uçlar).
 * - null: başlık yok / desteklenmeyen biçim (çoklu aralık dahil) -> tam içerik (200) dönülmeli
 * - "invalid": aralık dosya boyutunun dışında -> 416
 */
export function parseRange(header: string | null, size: number): ByteRange | "invalid" | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!m) return null;
  const [, a, b] = m;
  if (a === "" && b === "") return null;
  if (size === 0) return "invalid";
  if (a === "") {
    // son N bayt
    const n = Number(b);
    if (!(n > 0)) return "invalid";
    return { start: Math.max(size - n, 0), end: size - 1 };
  }
  const start = Number(a);
  const end = b === "" ? size - 1 : Math.min(Number(b), size - 1);
  if (start >= size || end < start) return "invalid";
  return { start, end };
}

/**
 * Depolamadaki bir dosyayı akışlı olarak sunar; Range isteklerine 206, geçersiz aralığa 416,
 * her yanıta `Accept-Ranges: bytes` ekler. Dosya diskte yoksa 404.
 */
export async function serveStoredFile(
  req: Request,
  opts: { storageKey: string; contentType: string; headers?: Record<string, string> }
): Promise<Response> {
  let size: number;
  try {
    size = (await statFile(opts.storageKey)).size;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return Response.json({ error: "Dosya içeriği depolamada bulunamadı" }, { status: 404 });
    }
    throw e;
  }
  const base: Record<string, string> = {
    "Content-Type": opts.contentType,
    "Accept-Ranges": "bytes",
    ...opts.headers,
  };
  const range = parseRange(req.headers.get("range"), size);
  if (range === "invalid") {
    return new Response(null, { status: 416, headers: { ...base, "Content-Range": `bytes */${size}` } });
  }
  if (range) {
    const body = Readable.toWeb(openReadStream(opts.storageKey, range)) as unknown as ReadableStream;
    return new Response(body, {
      status: 206,
      headers: {
        ...base,
        "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
        "Content-Length": String(range.end - range.start + 1),
      },
    });
  }
  if (size === 0) return new Response(null, { status: 200, headers: { ...base, "Content-Length": "0" } });
  const body = Readable.toWeb(openReadStream(opts.storageKey)) as unknown as ReadableStream;
  return new Response(body, { status: 200, headers: { ...base, "Content-Length": String(size) } });
}
