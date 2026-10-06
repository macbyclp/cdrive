// Next 16: "middleware" dosya kuralı "proxy" olarak yeniden adlandırıldı (işlev aynı).
import { NextResponse, type NextRequest } from "next/server";
import { resolveSecret } from "@/lib/session-secret";
import { jwtVerify } from "jose";

const secret = new TextEncoder().encode(
  resolveSecret()
);

export async function proxy(req: NextRequest) {
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

  // API: zorunlu ilk şifre değişimi / zorunlu 2FA kurulumu sayfalarla birlikte API'de de uygulanır
  // (aksi halde geçici şifreli hesap ya da 2FA'sız admin doğrudan API'yi kullanabilirdi).
  if (pathname.startsWith("/api/")) {
    if (payload && (payload.mustChangePassword || payload.twoFactorRequired)) {
      const allowed =
        pathname.startsWith("/api/account/") ||
        pathname.startsWith("/api/auth/") ||
        pathname.startsWith("/api/public/") ||
        pathname === "/api/me" ||
        pathname === "/api/health" ||
        pathname === "/api/client-error";
      if (!allowed) {
        return NextResponse.json(
          { error: payload.mustChangePassword ? "Önce şifrenizi belirleyin" : "Önce iki adımlı doğrulamayı kurun" },
          { status: 403 }
        );
      }
    }
    return NextResponse.next();
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
    // Büyük dosya yükleyen üç rota (files, files/zip-upload, files/scan) BİLEREK dışarıda: proxy (eski adıyla middleware)
    // çalışan her istekte Next gövdeyi bellekte kopyalar ve 10 MB'ta KESER (10 MB üstü yüklemeler
    // sessizce bozulur/başarısız olur). Bu rotalar zorunlu şifre/2FA kapısını requireUnrestrictedUser
    // ile kendileri uygular. Yeni bir yükleme rotası eklenirse buraya ve o fonksiyona ekleyin.
    "/api/((?!files$|files/zip-upload$|files/scan$).*)",
    "/login",
    "/setup",
  ],
};
