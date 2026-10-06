import { describe, it, expect, vi, beforeEach } from "vitest";
import { SignJWT } from "jose";

/** Yükleme rotaları middleware dışında kaldığı için zorunlu şifre/2FA kapısını requireUnrestrictedUser uygular. */
const m = vi.hoisted(() => ({ jar: new Map<string, string>(), sessionFind: vi.fn(), userFind: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (k: string) => (m.jar.has(k) ? { value: m.jar.get(k) } : undefined), set: () => {}, delete: () => {} }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { session: { findUnique: m.sessionFind }, user: { findUnique: m.userFind } },
}));

const secret = new TextEncoder().encode(process.env.SESSION_SECRET ?? "insecure-dev-secret-change-me");
async function login(flags: Record<string, unknown>) {
  const token = await new SignJWT({ userId: "u1", sessionId: "s1", role: "MEMBER", mustChangePassword: false, twoFactorRequired: false, ...flags })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(secret);
  m.jar.set("cdrive_session", token);
}

beforeEach(() => {
  m.jar.clear();
  m.sessionFind.mockResolvedValue({ id: "s1", userId: "u1", revokedAt: null });
  m.userFind.mockResolvedValue({ id: "u1", active: true, role: "MEMBER" });
});

describe("requireUnrestrictedUser", () => {
  it("normal oturumda kullanıcıyı döner", async () => {
    const { requireUnrestrictedUser } = await import("@/lib/auth");
    await login({});
    expect((await requireUnrestrictedUser()).id).toBe("u1");
  });

  it("mustChangePassword olan oturum 403 alır", async () => {
    const { requireUnrestrictedUser } = await import("@/lib/auth");
    await login({ mustChangePassword: true });
    await expect(requireUnrestrictedUser()).rejects.toMatchObject({ status: 403, message: "Önce şifrenizi belirleyin" });
  });

  it("zorunlu 2FA kurulmamış oturum 403 alır", async () => {
    const { requireUnrestrictedUser } = await import("@/lib/auth");
    await login({ twoFactorRequired: true });
    await expect(requireUnrestrictedUser()).rejects.toMatchObject({ status: 403 });
  });

  it("oturumsuz istek 401 alır", async () => {
    const { requireUnrestrictedUser } = await import("@/lib/auth");
    await expect(requireUnrestrictedUser()).rejects.toMatchObject({ status: 401 });
  });
});
