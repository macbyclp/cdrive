import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";

const SESSION_COOKIE = "cdrive_session";
const PENDING_2FA_COOKIE = "cdrive_2fa_pending";
const secret = new TextEncoder().encode(
  process.env.SESSION_SECRET ?? "insecure-dev-secret-change-me"
);

export type SessionPayload = {
  userId: string;
  email: string;
  name: string;
  role: Role;
};

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSession(payload: SessionPayload) {
  const token = await new SignJWT({ ...payload })
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
}

export async function destroySession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

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

export async function requireSession() {
  const session = await getSession();
  if (!session) throw new AuthError("Oturum bulunamadı");
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

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}
