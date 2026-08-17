import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const secret = new TextEncoder().encode(
  process.env.SESSION_SECRET ?? "insecure-dev-secret-change-me"
);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get("cdrive_session")?.value;

  let payload: { role?: string } | null = null;
  if (token) {
    try {
      const { payload: p } = await jwtVerify(token, secret);
      payload = p as { role?: string };
    } catch {
      payload = null;
    }
  }

  if (
    !payload &&
    (pathname.startsWith("/drive") ||
      pathname.startsWith("/admin") ||
      pathname.startsWith("/account") ||
      pathname.startsWith("/office"))
  ) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (payload && pathname.startsWith("/admin") && payload.role !== "ADMIN" && payload.role !== "MANAGER") {
    const url = req.nextUrl.clone();
    url.pathname = "/drive";
    return NextResponse.redirect(url);
  }

  if (payload && (pathname === "/login" || pathname === "/setup")) {
    const url = req.nextUrl.clone();
    url.pathname = "/drive";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/drive/:path*", "/admin/:path*", "/account/:path*", "/office/:path*", "/login", "/setup"],
};
