import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { middleware, config } from "@/middleware";
// @ts-expect-error — Next'in paketlenmiş iç modülü (Next matcher'ı bununla derler), tip bildirimi yok
import { pathToRegexp } from "next/dist/compiled/path-to-regexp";
import { resolveSecret } from "@/lib/session-secret";

async function reqWith(pathname: string, claims?: Record<string, unknown>) {
  const headers: Record<string, string> = {};
  if (claims) {
    const token = await new SignJWT(claims)
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(resolveSecret()));
    headers.cookie = `cdrive_session=${token}`;
  }
  return new NextRequest(`http://localhost:3000${pathname}`, { headers });
}
const loc = (res: Response) => res.headers.get("location");

describe("middleware yönlendirme kuralları", () => {
  it("oturumsuz kullanıcı korumalı sayfadan /login?next=... adresine gider", async () => {
    const res = await middleware(await reqWith("/drive"));
    expect(res.status).toBe(307);
    const u = new URL(loc(res)!);
    expect(u.pathname).toBe("/login");
    expect(u.searchParams.get("next")).toBe("/drive");
  });
  it("oturumsuz kullanıcı /login'i görebilir", async () => {
    const res = await middleware(await reqWith("/login"));
    expect(loc(res)).toBeNull();
  });
  it("geçersiz imzalı token oturumsuz sayılır", async () => {
    const req = new NextRequest("http://localhost:3000/drive", { headers: { cookie: "cdrive_session=bozuk.token.degeri" } });
    expect(new URL(loc(await middleware(req))!).pathname).toBe("/login");
  });
  it("mustChangePassword olan kullanıcı /onboarding dışına çıkamaz", async () => {
    const res = await middleware(await reqWith("/drive", { role: "MEMBER", mustChangePassword: true }));
    expect(new URL(loc(res)!).pathname).toBe("/onboarding");
    expect(loc(await middleware(await reqWith("/onboarding", { role: "MEMBER", mustChangePassword: true })))).toBeNull();
  });
  it("twoFactorRequired olan admin /account dışına çıkamaz", async () => {
    const res = await middleware(await reqWith("/admin", { role: "ADMIN", twoFactorRequired: true }));
    const u = new URL(loc(res)!);
    expect(u.pathname).toBe("/account");
    expect(u.searchParams.get("require2fa")).toBe("1");
  });
  it("MEMBER /admin'e giremez, ADMIN ve MANAGER girebilir", async () => {
    expect(new URL(loc(await middleware(await reqWith("/admin", { role: "MEMBER" })))!).pathname).toBe("/drive");
    expect(loc(await middleware(await reqWith("/admin", { role: "ADMIN" })))).toBeNull();
    expect(loc(await middleware(await reqWith("/admin", { role: "MANAGER" })))).toBeNull();
  });
  it("oturumlu kullanıcı /login ve /setup'tan /drive'a yönlenir", async () => {
    expect(new URL(loc(await middleware(await reqWith("/login", { role: "MEMBER" })))!).pathname).toBe("/drive");
    expect(new URL(loc(await middleware(await reqWith("/setup", { role: "MEMBER" })))!).pathname).toBe("/drive");
  });
});

// Next, middleware çalışan her istekte gövdeyi kopyalayıp 10 MB'ta KESER (denetlendi: 25 MB gönderilen
// gövdenin rotaya yalnız 10 MB'ı ulaştı). Büyük dosya yükleyen rotalar matcher dışında kalmalı;
// aksi halde 10 MB üstü yüklemeler sessizce bozulur.
describe("middleware matcher — büyük yükleme rotaları", () => {
  const matches = (path: string) => config.matcher.some((m: string) => pathToRegexp(m).test(path));

  it("yükleme rotaları middleware'den muaf (gövde kesilmez)", () => {
    for (const p of ["/api/files", "/api/files/zip-upload", "/api/files/scan"]) expect(matches(p)).toBe(false);
  });

  it("diğer API rotaları ve sayfalar hâlâ korunur", () => {
    for (const p of ["/api/files/abc", "/api/files/abc/comments", "/api/folders", "/api/me", "/drive", "/login"]) {
      expect(matches(p)).toBe(true);
    }
  });
});
