import { NextResponse } from "next/server";
import { reportError } from "@/lib/error-report";
import { clientIp, limitOr429 } from "@/lib/api-helpers";

// Tarayıcıdaki hata sınırlarından (error.tsx / global-error.tsx) gelen bildirimler. Oturum gerektirmez
// (hata giriş ekranında da olabilir), bu yüzden IP başına sınırlıdır ve yalnız kısaltılmış alanlar kabul edilir.
export async function POST(req: Request) {
  const limited = limitOr429("client-error", clientIp(req) ?? "unknown", 10, 60_000);
  if (limited) return limited;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  await reportError({
    source: "client",
    message: str(body.message) ?? "bilinmeyen istemci hatası",
    digest: str(body.digest),
    path: str(body.path),
    stack: str(body.stack),
  });
  return NextResponse.json({ ok: true });
}
