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
  // Beklenmeyen (5xx) hatalarda iç ayrıntı (Prisma/SQL/yol) istemciye verilmez; yalnız sunucu günlüğüne yazılır.
  const message =
    status === 500 ? "Beklenmeyen bir hata oluştu" : err instanceof Error ? err.message : "Beklenmeyen bir hata oluştu";
  if (status === 500) console.error(err);
  return NextResponse.json({ error: message }, { status });
}

/**
 * İstemci IP'si. `X-Forwarded-For`'un SOL (ilk) değeri istemci tarafından sahte yazılabilir
 * (nginx `$proxy_add_x_forwarded_for` istemcinin değerini korur, kendininkini SONA ekler) — hız
 * sınırları ve denetim kaydı için güvenilmez. Güvenilen vekil sayısı `TRUSTED_PROXY_HOPS` (varsayılan 1,
 * ör. Caddy/nginx) ile verilir ve IP, listenin SAĞINDAN o kadar geriden alınır. Vekilin kendi eklediği
 * değerler sağdadır, istemcinin yazdıkları solda kalır. 0 = önünde vekil yok, başlık yok sayılır.
 */
export function clientIp(req: Request, env: NodeJS.ProcessEnv = process.env) {
  const hops = trustedProxyHops(env);
  if (hops === 0) return null;
  const parts = (req.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  // Beklenenden kısa liste: vekil zinciri eksik/farklı; en soldaki değeri kullan.
  return parts[Math.max(0, parts.length - hops)];
}

function trustedProxyHops(env: NodeJS.ProcessEnv): number {
  const raw = env.TRUSTED_PROXY_HOPS?.trim();
  if (!raw) return 1;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : 1;
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
