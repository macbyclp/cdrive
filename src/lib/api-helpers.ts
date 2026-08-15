import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth";

export function errorResponse(err: unknown) {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  const status = (err as { status?: number })?.status ?? 500;
  const message = err instanceof Error ? err.message : "Beklenmeyen bir hata oluştu";
  if (status === 500) console.error(err);
  return NextResponse.json({ error: message }, { status });
}

export function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}
