import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

export function errorResponse(err: unknown) {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const message = first ? `${first.path.join(".")}: ${first.message}` : "Geçersiz istek";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  const status = (err as { status?: number })?.status ?? 500;
  const message = err instanceof Error ? err.message : "Beklenmeyen bir hata oluştu";
  if (status === 500) console.error(err);
  return NextResponse.json({ error: message }, { status });
}

export function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

/**
 * Bellek-içi hız sınırı kapısı: limit aşıldıysa 429 yanıtı döner, aksi halde null.
 * Kullanım: `const limited = limitOr429("upload", user.id, 30, 60_000); if (limited) return limited;`
 * (Tek Node süreci varsayımı — bkz. lib/rate-limit.ts.)
 */
export function limitOr429(bucket: string, key: string, limit: number, windowMs: number) {
  if (rateLimit(`${bucket}:${key}`, limit, windowMs)) return null;
  return NextResponse.json({ error: "Çok fazla istek. Lütfen biraz bekleyin." }, { status: 429 });
}
