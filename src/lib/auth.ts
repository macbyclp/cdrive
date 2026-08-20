import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";

const SESSION_COOKIE = "cdrive_session";
const PENDING_2FA_COOKIE = "cdrive_2fa_pending";
// Admin bir kullanıcıyı "taklit" ederken (bkz. startImpersonation) kimden dönüleceği bilgisi
// ayrı, kısa ömürlü bir çerezde tutulur — hedef kullanıcının normal cdrive_session çerezi
// ÜZERİNE YAZILIR (yeni bir Session satırıyla), admin'in kendi oturumu DB'de hiç bozulmaz,
// sadece bu çerezle "geri dönüş anahtarı" saklanır.
const IMPERSONATOR_COOKIE = "cdrive_impersonator";
const secret = new TextEncoder().encode(
  process.env.SESSION_SECRET ?? "insecure-dev-secret-change-me"
);

export type SessionPayload = {
  userId: string;
  email: string;
  name: string;
  role: Role;
  sessionId: string;
  mustChangePassword: boolean;
  twoFactorRequired: boolean;
};

/**
 * SystemSettings.require2faForAdmins açıksa ve bu ADMIN henüz 2FA kurmadıysa true —
 * middleware bunu mustChangePassword ile aynı desende bir "hard gate" olarak kullanır
 * (2FA kurana kadar /account dışında hiçbir korumalı sayfaya giremez). Sadece ADMIN rolü
 * için zorlanır; MANAGER/MEMBER etkilenmez.
 */
export async function computeTwoFactorRequired(user: { role: Role; twoFactorEnabled: boolean }): Promise<boolean> {
  if (user.role !== "ADMIN" || user.twoFactorEnabled) return false;
  const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });
  return !!settings?.require2faForAdmins;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

/**
 * Yeni bir oturum açar: DB'de bir Session kaydı oluşturur (uzaktan
 * sonlandırılabilmesi için) ve JWT'ye o kaydın id'sini gömer. JWT tek
 * başına imza kontrolüyle doğrulanabilir olsa da, DB'deki kayıt "revoke"
 * edilirse artık geçerli sayılmaz (bkz. requireSession).
 */
export async function createSession(
  payload: Omit<SessionPayload, "sessionId">,
  meta?: { ip?: string | null; userAgent?: string | null }
) {
  const session = await prisma.session.create({
    data: { userId: payload.userId, ip: meta?.ip ?? undefined, userAgent: meta?.userAgent ?? undefined },
  });

  const token = await new SignJWT({ ...payload, sessionId: session.id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return session.id;
}

export async function destroySession() {
  const session = await getSession();
  if (session) {
    await prisma.session.updateMany({
      where: { id: session.sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/**
 * Çerezi DB'ye dokunmadan siler. Middleware sadece JWT imzasının geçerliliğine
 * bakar — DB'de revoke edilmiş/eksik bir oturumu (ör. bu özellikten önce
 * verilmiş eski bir JWT) "geçerli" sanıp /login'i /drive'a geri yönlendirebilir.
 * Böyle bir oturum tespit edildiğinde çerez burada temizlenmeli, aksi halde
 * istemci /login'e yönlendiği anda middleware onu tekrar /drive'a atar.
 */
export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Sadece çerezdeki JWT'yi imza açısından çözer — DB'ye gitmez, ucuzdur. */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/** JWT geçerli olsa bile, DB'deki oturum kaydı "revoke" edilmişse reddeder. */
export async function requireSession() {
  const session = await getSession();
  if (!session?.sessionId) throw new AuthError("Oturum sona erdi, tekrar giriş yapın");
  const record = await prisma.session.findUnique({ where: { id: session.sessionId } });
  if (!record || record.revokedAt) throw new AuthError("Oturum sona erdi, tekrar giriş yapın");
  return session;
}

export async function requireUser() {
  const session = await requireSession();
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || !user.active) throw new AuthError("Kullanıcı bulunamadı veya pasif");
  return user;
}

export async function requireRole(...roles: Role[]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw new AuthError("Yetkisiz erişim", 403);
  return user;
}

// --- Aktif oturum yönetimi (hesap ayarlarında görüntülenir) ---

export async function listSessions(userId: string) {
  return prisma.session.findMany({
    where: { userId, revokedAt: null },
    orderBy: { lastSeenAt: "desc" },
  });
}

export async function revokeSession(userId: string, sessionId: string) {
  await prisma.session.updateMany({
    where: { id: sessionId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeOtherSessions(userId: string, exceptSessionId: string) {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null, id: { not: exceptSessionId } },
    data: { revokedAt: new Date() },
  });
}

// --- İki adımlı giriş (2FA) için geçici oturum ---
// Şifre doğrulandıktan sonra, TOTP kodu girilene kadar tam oturum açılmaz;
// bu ara adım kısa ömürlü, ayrı ve daha kısıtlı bir çerezde tutulur.

type Pending2FAPayload = { userId: string };

export async function createPending2FA(userId: string) {
  const token = await new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret);

  const store = await cookies();
  store.set(PENDING_2FA_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 5,
  });
}

export async function getPending2FA(): Promise<Pending2FAPayload | null> {
  const store = await cookies();
  const token = store.get(PENDING_2FA_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as Pending2FAPayload;
  } catch {
    return null;
  }
}

export async function clearPending2FA() {
  const store = await cookies();
  store.delete(PENDING_2FA_COOKIE);
}

// --- Başarısız giriş kilitleme ---
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 dakika

export function isLocked(user: { lockedUntil: Date | null }): boolean {
  return !!user.lockedUntil && user.lockedUntil.getTime() > Date.now();
}

export async function registerFailedLogin(userId: string, currentAttempts: number) {
  const attempts = currentAttempts + 1;
  const data: { failedLoginAttempts: number; lockedUntil?: Date } = { failedLoginAttempts: attempts };
  if (attempts >= MAX_FAILED_ATTEMPTS) {
    data.lockedUntil = new Date(Date.now() + LOCKOUT_MS);
    data.failedLoginAttempts = 0;
  }
  await prisma.user.update({ where: { id: userId }, data });
  return attempts >= MAX_FAILED_ATTEMPTS;
}

export async function clearFailedLogins(userId: string) {
  await prisma.user.update({ where: { id: userId }, data: { failedLoginAttempts: 0, lockedUntil: null } });
}

// --- Kullanıcı taklit etme (admin panelinden, şifre değiştirmeden "biri olarak" girmek) ---

type ImpersonatorPayload = { adminUserId: string; adminSessionId: string; adminName: string };

/**
 * Admin başka bir kullanıcı olarak girer: hedefe ait TAMAMEN YENİ bir Session satırı
 * açılır (createSession) — cdrive_session çerezi buna yazılır, admin'in kendi oturumu DB'de
 * dokunulmadan durur. Admin'in kimliği + geri dönmek için gereken sessionId, ayrı ve kısa
 * ömürlü (2 saat) bir çerezde (IMPERSONATOR_COOKIE) saklanır — bkz. stopImpersonation.
 */
export async function startImpersonation(
  admin: { id: string; name: string },
  target: { id: string; email: string; name: string; role: Role; mustChangePassword: boolean; twoFactorEnabled: boolean },
  meta?: { ip?: string | null; userAgent?: string | null }
) {
  const adminSession = await requireSession();

  const impToken = await new SignJWT({
    adminUserId: admin.id,
    adminSessionId: adminSession.sessionId,
    adminName: admin.name,
  } satisfies ImpersonatorPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(secret);

  const store = await cookies();
  store.set(IMPERSONATOR_COOKIE, impToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 2,
  });

  // cdrive_session çerezini hedefin YENİ oturumuna yazar — admin'in oturumu DB'de kalır.
  const targetTwoFactorRequired = await computeTwoFactorRequired(target);
  await createSession(
    {
      userId: target.id,
      email: target.email,
      name: target.name,
      role: target.role,
      mustChangePassword: target.mustChangePassword,
      twoFactorRequired: targetTwoFactorRequired,
    },
    meta
  );
}

export async function getImpersonator(): Promise<ImpersonatorPayload | null> {
  const store = await cookies();
  const token = store.get(IMPERSONATOR_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as ImpersonatorPayload;
  } catch {
    return null;
  }
}

/**
 * Taklit oturumundan admin'in kendi oturumuna geri döner: hedefin taklit sırasında açılan
 * oturumunu revoke eder (hijyen — arkada canlı taklit oturumu bırakmamak için), admin'in
 * ORİJİNAL sessionId'siyle yeni bir JWT basar (yeni Session satırı AÇILMAZ, var olan
 * kullanılır — /onboarding tamamlanınca yapılan "JWT re-mint" ile aynı desen).
 */
export async function stopImpersonation(): Promise<{ adminId: string; targetId: string | null }> {
  const imp = await getImpersonator();
  if (!imp) throw new AuthError("Taklit oturumu bulunamadı");

  const adminSessionRecord = await prisma.session.findUnique({ where: { id: imp.adminSessionId } });
  if (!adminSessionRecord || adminSessionRecord.revokedAt) {
    await clearImpersonatorCookie();
    throw new AuthError("Yönetici oturumunuz artık geçerli değil, tekrar giriş yapın");
  }
  const admin = await prisma.user.findUnique({ where: { id: imp.adminUserId } });
  if (!admin || !admin.active) {
    await clearImpersonatorCookie();
    throw new AuthError("Yönetici hesabı bulunamadı");
  }

  const currentSession = await getSession(); // şu an hedefin oturumu
  let targetId: string | null = null;
  if (currentSession?.sessionId) {
    targetId = currentSession.userId;
    await prisma.session.updateMany({
      where: { id: currentSession.sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  const adminTwoFactorRequired = await computeTwoFactorRequired(admin);
  const token = await new SignJWT({
    userId: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
    sessionId: imp.adminSessionId,
    mustChangePassword: admin.mustChangePassword,
    twoFactorRequired: adminTwoFactorRequired,
  } satisfies SessionPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  await clearImpersonatorCookie();

  return { adminId: admin.id, targetId };
}

async function clearImpersonatorCookie() {
  const store = await cookies();
  store.delete(IMPERSONATOR_COOKIE);
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}
