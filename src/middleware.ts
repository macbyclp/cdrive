import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const secret = new TextEncoder().encode(
  process.env.SESSION_SECRET ?? "insecure-dev-secret-change-me"
);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get("cdrive_session")?.value;

  let payload: { role?: string; mustChangePassword?: boolean; twoFactorRequired?: boolean } | null = null;
  if (token) {
    try {
      const { payload: p } = await jwtVerify(token, secret);
      payload = p as { role?: string; mustChangePassword?: boolean; twoFactorRequired?: boolean };
    } catch {
      payload = null;
    }
  }

  const isProtected =
    pathname.startsWith("/drive") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/account") ||
    pathname.startsWith("/office") ||
    pathname.startsWith("/orders") ||
    pathname.startsWith("/accounting") ||
    pathname.startsWith("/customers") ||
    pathname.startsWith("/panel") ||
    pathname.startsWith("/chat") ||
    pathname.startsWith("/production") ||
    pathname.startsWith("/onboarding");

  if (!payload && isProtected) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Admin tarafından oluşturulan hesaplar ilk girişte /onboarding'e (yeni şifre + avatar
  // seçimi) yönlendirilir — tamamlanana kadar başka hiçbir korumalı sayfaya giremez.
  if (payload?.mustChangePassword && isProtected && pathname !== "/onboarding") {
    const url = req.nextUrl.clone();
    url.pathname = "/onboarding";
    return NextResponse.redirect(url);
  }

  // Sistem ayarlarından "adminlere 2FA zorunlu" açıksa, henüz kurmamış bir ADMIN
  // /account dışında hiçbir korumalı sayfaya giremez — 2FA'yı kurana kadar (bkz.
  // computeTwoFactorRequired, mustChangePassword ile aynı desen).
  if (payload?.twoFactorRequired && isProtected && pathname !== "/account") {
    const url = req.nextUrl.clone();
    url.pathname = "/account";
    url.searchParams.set("require2fa", "1");
    return NextResponse.redirect(url);
  }

  if (payload && pathname.startsWith("/admin") && payload.role !== "ADMIN" && payload.role !== "MANAGER") {
    const url = req.nextUrl.clone();
    url.pathname = "/drive";
    return NextResponse.redirect(url);
  }

  if (payload && (pathname === "/login" || pathname === "/setup")) {
    const url = req.nextUrl.clone();
    url.pathname = payload.mustChangePassword ? "/onboarding" : "/drive";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/drive/:path*",
    "/admin/:path*",
    "/account/:path*",
    "/office/:path*",
    "/orders/:path*",
    "/accounting/:path*",
    "/customers/:path*",
    "/panel/:path*",
    "/chat/:path*",
    "/production/:path*",
    "/onboarding/:path*",
    "/login",
    "/setup",
  ],
};
