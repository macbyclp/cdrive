import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";

const SESSION_COOKIE = "cdrive_session";
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

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}
