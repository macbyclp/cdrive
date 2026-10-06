import { describe, it, expect, vi, beforeEach } from "vitest";
import { jwtVerify } from "jose";

/**
 * reissueSession: onboarding / 2FA aç-kapa sonrası JWT güncel bayraklarla yeniden imzalanır.
 * Yeni Session satırı AÇILMAMALI (eskiden eski oturum açık kalıyordu) ve "Beni hatırla" korunmalı.
 * stopImpersonation: admin'in kendi "Beni hatırla" seçimine göre ömür (eskiden hep 7 gün).
 */

const m = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  set: vi.fn(),
  sessionCreate: vi.fn(),
  sessionFind: vi.fn(),
  sessionUpdateMany: vi.fn(),
  userFind: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => (m.jar.has(k) ? { value: m.jar.get(k) } : undefined),
    set: (k: string, v: string, o: { maxAge: number }) => {
      m.jar.set(k, v);
      m.set(k, o);
    },
    delete: (k: string) => m.jar.delete(k),
  }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    session: { create: m.sessionCreate, findUnique: m.sessionFind, updateMany: m.sessionUpdateMany },
    user: { findUnique: m.userFind },
    systemSettings: { findUnique: async () => null },
  },
}));

const secret = new TextEncoder().encode(process.env.SESSION_SECRET ?? "insecure-dev-secret-change-me");
const DAY = 24 * 60 * 60;

beforeEach(() => {
  vi.clearAllMocks();
  m.jar.clear();
});

describe("reissueSession", () => {
  it("aynı sessionId ile yeniden imzalar, yeni Session satırı açmaz, remember'ı korur", async () => {
    const { createSession, reissueSession } = await import("@/lib/auth");
    m.sessionCreate.mockResolvedValue({ id: "s1" });
    m.sessionFind.mockResolvedValue({ id: "s1", userId: "u1", revokedAt: null });

    await createSession({
      userId: "u1", email: "a@b.c", name: "A", role: "MEMBER",
      mustChangePassword: true, twoFactorRequired: false, remember: true,
    });
    expect(m.sessionCreate).toHaveBeenCalledTimes(1);

    await reissueSession({ mustChangePassword: false });

    expect(m.sessionCreate).toHaveBeenCalledTimes(1); // yeni satır yok
    const { payload } = await jwtVerify(m.jar.get("cdrive_session")!, secret);
    expect(payload.sessionId).toBe("s1");
    expect(payload.mustChangePassword).toBe(false);
    expect(payload.remember).toBe(true);
    expect(m.set.mock.lastCall![1].maxAge).toBe(30 * DAY);
  });
});

describe("stopImpersonation ömrü", () => {
  async function run(adminRemember: boolean) {
    const { createSession, startImpersonation, stopImpersonation } = await import("@/lib/auth");
    m.sessionCreate.mockResolvedValueOnce({ id: "admin-s" }).mockResolvedValueOnce({ id: "target-s" });
    m.sessionFind.mockImplementation(async ({ where }: { where: { id: string } }) => ({
      id: where.id, userId: where.id === "admin-s" ? "admin" : "target", revokedAt: null,
    }));
    m.userFind.mockResolvedValue({ id: "admin", email: "ad@x.y", name: "Admin", role: "ADMIN", active: true, mustChangePassword: false, twoFactorEnabled: true });

    await createSession({ userId: "admin", email: "ad@x.y", name: "Admin", role: "ADMIN", mustChangePassword: false, twoFactorRequired: false, remember: adminRemember });
    await startImpersonation(
      { id: "admin", name: "Admin" },
      { id: "target", email: "t@x.y", name: "T", role: "MEMBER", mustChangePassword: false, twoFactorEnabled: false }
    );
    await stopImpersonation();
    return jwtVerify(m.jar.get("cdrive_session")!, secret);
  }

  it("admin 'beni hatırla' dememişse geri dönüşte 1 gün (7 gün değil)", async () => {
    const { payload } = await run(false);
    expect(payload.sessionId).toBe("admin-s");
    expect(m.set.mock.lastCall![1].maxAge).toBe(1 * DAY);
  });

  it("admin 'beni hatırla' demişse 30 gün", async () => {
    await run(true);
    expect(m.set.mock.lastCall![1].maxAge).toBe(30 * DAY);
  });
});
