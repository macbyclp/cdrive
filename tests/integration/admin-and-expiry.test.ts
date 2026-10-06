import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { prisma } from "@/lib/prisma";
import { notifyExpiringLinks } from "@/lib/link-expiry";
import { runCleanup } from "@/lib/cleanup";
import { replaceRecoveryCodes, countRemainingRecoveryCodes } from "@/lib/recovery-codes";
import { createTestUser, createTestFolder, createTestFile, cleanupTestData } from "../helpers/db";

let userIds: string[] = [];
afterEach(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.shareLink.deleteMany({ where: { createdById: { in: userIds } } });
  await cleanupTestData({ userIds });
  userIds = [];
  vi.doUnmock("@/lib/auth");
});
async function user(role: "ADMIN" | "MEMBER" = "MEMBER") {
  const u = await createTestUser({ role });
  userIds.push(u.id);
  return u;
}
const H = 3600_000;

describe("süresi dolmak üzere olan bağlantı uyarıları (gerçek DB)", () => {
  async function share(ownerId: string, fileId: string, over: { expiresInH: number; lifetimeH: number; revoked?: boolean }) {
    const expiresAt = new Date(Date.now() + over.expiresInH * H);
    return prisma.shareLink.create({
      data: {
        token: `t-${Math.random().toString(36).slice(2)}`, fileId, createdById: ownerId, expiresAt, revoked: over.revoked ?? false,
        createdAt: new Date(expiresAt.getTime() - over.lifetimeH * H),
      },
    });
  }

  it("48 saat içinde dolacak uzun ömürlü bağlantı için sahibi TEK SEFER uyarılır", async () => {
    const owner = await user();
    const file = await createTestFile({ ownerId: owner.id, name: "sozlesme.pdf" });
    const l = await share(owner.id, file.id, { expiresInH: 24, lifetimeH: 24 * 7 });
    expect(await notifyExpiringLinks()).toBeGreaterThanOrEqual(1);
    const n = await prisma.notification.findMany({ where: { userId: owner.id, type: "LINK_EXPIRING" } });
    expect(n).toHaveLength(1);
    expect(n[0].message).toContain("sozlesme.pdf");
    expect((await prisma.shareLink.findUniqueOrThrow({ where: { id: l.id } })).expiryNotifiedAt).not.toBeNull();
    await notifyExpiringLinks(); // ikinci çalıştırma tekrar bildirmez
    expect(await prisma.notification.count({ where: { userId: owner.id, type: "LINK_EXPIRING" } })).toBe(1);
  });

  it("eşzamanlı iki çalıştırma aynı bağlantı için tek bildirim üretir", async () => {
    const owner = await user();
    const file = await createTestFile({ ownerId: owner.id });
    await share(owner.id, file.id, { expiresInH: 10, lifetimeH: 24 * 7 });
    await Promise.all([notifyExpiringLinks(), notifyExpiringLinks(), notifyExpiringLinks()]);
    expect(await prisma.notification.count({ where: { userId: owner.id, type: "LINK_EXPIRING" } })).toBe(1);
  });

  it("uyarılmayanlar: kısa ömürlü, henüz uzak, süresi geçmiş, iptal edilmiş, çöpteki dosya", async () => {
    const owner = await user();
    const file = await createTestFile({ ownerId: owner.id });
    await share(owner.id, file.id, { expiresInH: 5, lifetimeH: 24 }); // kısa ömürlü
    await share(owner.id, file.id, { expiresInH: 24 * 5, lifetimeH: 24 * 10 }); // uzak
    await share(owner.id, file.id, { expiresInH: -2, lifetimeH: 24 * 10 }); // süresi geçmiş
    await share(owner.id, file.id, { expiresInH: 10, lifetimeH: 24 * 7, revoked: true }); // iptal
    const trashed = await createTestFile({ ownerId: owner.id });
    await prisma.file.update({ where: { id: trashed.id }, data: { deletedAt: new Date() } });
    await share(owner.id, trashed.id, { expiresInH: 10, lifetimeH: 24 * 7 });
    await notifyExpiringLinks();
    expect(await prisma.notification.count({ where: { userId: owner.id, type: "LINK_EXPIRING" } })).toBe(0);
  });

  it("dosya isteği: dolmak üzereyse uyarılır; kontenjanı dolmuşsa uyarılmaz", async () => {
    const owner = await user();
    const folder = await createTestFolder({ ownerId: owner.id });
    const mk = (title: string, uploadCount: number) =>
      prisma.uploadRequest.create({
        data: {
          token: `u-${Math.random().toString(36).slice(2)}`, folderId: folder.id, createdById: owner.id, title,
          expiresAt: new Date(Date.now() + 10 * H), createdAt: new Date(Date.now() - 24 * 7 * H), maxFiles: 5, uploadCount,
        },
      });
    await mk("Açık istek", 1);
    await mk("Dolmuş istek", 5);
    await notifyExpiringLinks();
    const n = await prisma.notification.findMany({ where: { userId: owner.id, type: "LINK_EXPIRING" } });
    expect(n).toHaveLength(1);
    expect(n[0].message).toContain("Açık istek");
    expect(n[0]).toMatchObject({ targetType: "folder", targetId: folder.id });
  });

  it("runCleanup sonucu uyarı sayısını raporlar", async () => {
    const owner = await user();
    const file = await createTestFile({ ownerId: owner.id });
    await share(owner.id, file.id, { expiresInH: 12, lifetimeH: 24 * 7 });
    const r = await runCleanup();
    expect(r.expiringLinksNotified).toBeGreaterThanOrEqual(1);
  });
});

describe("yönetici: 2FA sıfırlama ve kullanıcı listesi (gerçek DB)", () => {
  async function asAdmin(admin: { id: string }) {
    vi.resetModules();
    vi.doMock("@/lib/auth", () => ({
      requireRole: async () => prisma.user.findUniqueOrThrow({ where: { id: admin.id } }),
      verifyPassword: (p: string, h: string) => bcrypt.compare(p, h),
      AuthError: class extends Error {},
    }));
  }
  async function adminWithPassword() {
    const a = await createTestUser({ role: "ADMIN" });
    userIds.push(a.id);
    await prisma.user.update({ where: { id: a.id }, data: { passwordHash: await bcrypt.hash("admin-parola-1", 4) } });
    return a;
  }
  const post = (password: string) => new Request("http://x", { method: "POST", body: JSON.stringify({ password }), headers: { "x-forwarded-for": "10.1.1.1" } });
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

  async function userWith2fa() {
    const t = await user();
    await prisma.user.update({ where: { id: t.id }, data: { twoFactorEnabled: true, twoFactorSecret: "JBSWY3DPEHPK3PXP", twoFactorLastStep: 123 } });
    await replaceRecoveryCodes(t.id);
    await prisma.session.create({ data: { userId: t.id } });
    await prisma.session.create({ data: { userId: t.id } });
    return t;
  }

  it("2FA, kurtarma kodları ve oturumlar sıfırlanır; denetim kaydı yazılır", async () => {
    const admin = await adminWithPassword();
    const target = await userWith2fa();
    await asAdmin(admin);
    const { POST } = await import("@/app/api/admin/users/[id]/reset-2fa/route");
    const res = await POST(post("admin-parola-1"), ctx(target.id));
    expect(res.status).toBe(200);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(after).toMatchObject({ twoFactorEnabled: false, twoFactorSecret: null, twoFactorLastStep: null });
    expect(await countRemainingRecoveryCodes(target.id)).toBe(0);
    expect(await prisma.session.count({ where: { userId: target.id, revokedAt: null } })).toBe(0);
    const log = await prisma.auditLog.findFirst({ where: { userId: admin.id, targetId: target.id }, orderBy: { createdAt: "desc" } });
    expect(log?.action).toBe("TWO_FACTOR_DISABLE");
    expect(log?.detail).toContain("yönetici tarafından");
  });

  it("yanlış yönetici şifresi 401 — hiçbir şey değişmez", async () => {
    const admin = await adminWithPassword();
    const target = await userWith2fa();
    await asAdmin(admin);
    const { POST } = await import("@/app/api/admin/users/[id]/reset-2fa/route");
    expect((await POST(post("yanlis"), ctx(target.id))).status).toBe(401);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).twoFactorEnabled).toBe(true);
    expect(await countRemainingRecoveryCodes(target.id)).toBe(10);
  });

  it("kendi hesabına uygulanamaz (400); 2FA'sı kapalı kullanıcıya da (400)", async () => {
    const admin = await adminWithPassword();
    await prisma.user.update({ where: { id: admin.id }, data: { twoFactorEnabled: true, twoFactorSecret: "X" } });
    const plain = await user();
    await asAdmin(admin);
    const { POST } = await import("@/app/api/admin/users/[id]/reset-2fa/route");
    expect((await POST(post("admin-parola-1"), ctx(admin.id))).status).toBe(400);
    expect((await POST(post("admin-parola-1"), ctx(plain.id))).status).toBe(400);
  });

  it("kullanıcı listesi son giriş / son görülme / 2FA durumunu döner; hassas alanları döndürmez", async () => {
    const admin = await adminWithPassword();
    const target = await userWith2fa();
    const old = new Date(Date.now() - 3 * 24 * H);
    await prisma.session.updateMany({ where: { userId: target.id }, data: { createdAt: old, lastSeenAt: old } });
    const newest = await prisma.session.create({ data: { userId: target.id } });
    await asAdmin(admin);
    const { GET } = await import("@/app/api/admin/users/route");
    const rows = (await (await GET(new Request("http://x/api/admin/users?q=" + encodeURIComponent(target.email)))).json()) as Record<string, unknown>[];
    const row = rows.find((r) => r.id === target.id)!;
    expect(row.twoFactorEnabled).toBe(true);
    expect(new Date(row.lastLoginAt as string).getTime()).toBeGreaterThanOrEqual(newest.createdAt.getTime() - 1000);
    expect(row.lastSeenAt).toBeTruthy();
    expect(row).not.toHaveProperty("twoFactorSecret");
    expect(row).not.toHaveProperty("passwordHash");
    expect(row.twoFactorLastStep).toBeUndefined();
  });

  it("hiç girişi olmayan kullanıcı için lastLoginAt null", async () => {
    const admin = await adminWithPassword();
    const t = await user();
    await asAdmin(admin);
    const { GET } = await import("@/app/api/admin/users/route");
    const rows = (await (await GET(new Request("http://x/api/admin/users?q=" + encodeURIComponent(t.email)))).json()) as Record<string, unknown>[];
    expect(rows.find((r) => r.id === t.id)!.lastLoginAt).toBeNull();
  });
});

describe("oturum 'son görülme' (gerçek DB)", () => {
  const secret = new TextEncoder().encode(process.env.SESSION_SECRET ?? "insecure-dev-secret-change-me");
  const jar = new Map<string, string>();
  beforeEach(() => {
    jar.clear();
    vi.resetModules();
    vi.doMock("next/headers", () => ({ cookies: async () => ({ get: (k: string) => (jar.has(k) ? { value: jar.get(k) } : undefined), set: () => {}, delete: () => {} }) }));
  });
  afterEach(() => vi.doUnmock("next/headers"));

  async function login(userId: string, sessionId: string) {
    jar.set("cdrive_session", await new SignJWT({ userId, sessionId, role: "MEMBER", mustChangePassword: false, twoFactorRequired: false }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(secret));
  }
  const seen = async (id: string) => (await prisma.session.findUniqueOrThrow({ where: { id } })).lastSeenAt.getTime();

  it("eski 'son görülme' istek sonrası güncellenir; yenisi dokunulmaz", async () => {
    const u = await user();
    const stale = await prisma.session.create({ data: { userId: u.id, lastSeenAt: new Date(Date.now() - 20 * 60_000) } });
    const fresh = await prisma.session.create({ data: { userId: u.id, lastSeenAt: new Date(Date.now() - 60_000) } });
    const { requireSession } = await import("@/lib/auth");

    const freshBefore = await seen(fresh.id);
    await login(u.id, stale.id);
    await requireSession();
    await login(u.id, fresh.id);
    await requireSession();
    await new Promise((r) => setTimeout(r, 300)); // yazma yanıtı beklemeden arka planda yapılır

    expect(await seen(stale.id)).toBeGreaterThan(Date.now() - 10_000);
    expect(await seen(fresh.id)).toBe(freshBefore);
  });
});
