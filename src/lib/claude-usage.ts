// Claude yardımcısı: erişim denetimi (açık/kapalı, rol), günlük kota ve kullanım kaydı.
// Ortak (sistem geneli) anahtar kullanıldığı için maliyet kişi başı günlük token ve sohbet sınırıyla korunur.

import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getClaudeApiKey } from "@/lib/claude-key";

export const ALL_ROLES: Role[] = ["ADMIN", "MANAGER", "MEMBER"];

/** Kişi başı günlük sınırlar (UTC günü). Env ile ayarlanır: CLAUDE_DAILY_TOKENS, CLAUDE_DAILY_CHATS. */
export function claudeLimits(): { dailyTokens: number; dailyChats: number } {
  const num = (v: string | undefined, d: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : d;
  };
  return { dailyTokens: num(process.env.CLAUDE_DAILY_TOKENS, 300_000), dailyChats: num(process.env.CLAUDE_DAILY_CHATS, 100) };
}

export function utcDay(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function parseRoles(csv: string | null | undefined): Role[] {
  const set = new Set((csv ?? "").split(",").map((s) => s.trim()));
  return ALL_ROLES.filter((r) => set.has(r));
}

export type ClaudeAccess =
  | { ok: true }
  | { ok: false; reason: "disabled" | "role" | "unconfigured" | "quota"; message: string; status: number };

export const ACCESS_MESSAGES = {
  disabled: "Claude yardımcısı yönetici tarafından kapatıldı.",
  role: "Claude yardımcısı rolünüz için açık değil. Yöneticinize danışın.",
  unconfigured: "Claude henüz ayarlanmamış. Yöneticinize bildirin (Yönetim → Ayarlar → Claude).",
  quota: "Bugünkü Claude kullanım kotanız doldu. Yarın (UTC 00:00'dan sonra) yeniden kullanabilirsiniz; daha fazlası için yöneticinize başvurun.",
} as const;

/** Özellik açık mı, kullanıcının rolü izinli mi, anahtar var mı? (kota ayrıca checkQuota ile bakılır) */
export async function claudeAccess(user: { role: Role }): Promise<ClaudeAccess> {
  const s = await prisma.systemSettings.findUnique({ where: { id: 1 }, select: { claudeEnabled: true, claudeRoles: true } });
  const enabled = s?.claudeEnabled ?? true;
  const roles = parseRoles(s?.claudeRoles ?? ALL_ROLES.join(","));
  if (!enabled) return { ok: false, reason: "disabled", message: ACCESS_MESSAGES.disabled, status: 403 };
  if (!roles.includes(user.role)) return { ok: false, reason: "role", message: ACCESS_MESSAGES.role, status: 403 };
  if (!(await getClaudeApiKey())) return { ok: false, reason: "unconfigured", message: ACCESS_MESSAGES.unconfigured, status: 503 };
  return { ok: true };
}

export async function todaysUsage(userId: string, day = utcDay()) {
  const row = await prisma.claudeUsage.findUnique({ where: { userId_day: { userId, day } } });
  return {
    tokens: Number((row?.inputTokens ?? 0n) + (row?.outputTokens ?? 0n)),
    chats: row?.chats ?? 0,
  };
}

/** Kota dolduysa kullanıcıya gösterilecek mesajı, değilse null döner. */
export async function checkQuota(userId: string): Promise<string | null> {
  const { dailyTokens, dailyChats } = claudeLimits();
  const u = await todaysUsage(userId);
  return u.tokens >= dailyTokens || u.chats >= dailyChats ? ACCESS_MESSAGES.quota : null;
}

/** Yeni sohbet başladı (sohbet sayacı). */
export async function recordChatStart(userId: string): Promise<void> {
  const day = utcDay();
  await prisma.claudeUsage.upsert({
    where: { userId_day: { userId, day } },
    create: { userId, day, chats: 1 },
    update: { chats: { increment: 1 } },
  });
}

/** Her Anthropic yanıtındaki usage → kullanıcı bazında kayıt. Hata kullanımı kesmez. */
export async function recordUsage(userId: string, usage: { input_tokens?: number; output_tokens?: number } | undefined): Promise<void> {
  const input = Math.max(0, Math.floor(usage?.input_tokens ?? 0));
  const output = Math.max(0, Math.floor(usage?.output_tokens ?? 0));
  const day = utcDay();
  try {
    await prisma.claudeUsage.upsert({
      where: { userId_day: { userId, day } },
      create: { userId, day, inputTokens: BigInt(input), outputTokens: BigInt(output), requests: 1 },
      update: { inputTokens: { increment: BigInt(input) }, outputTokens: { increment: BigInt(output) }, requests: { increment: 1 } },
    });
  } catch {
    /* kayıt başarısızsa sohbet yine de sürer */
  }
}

/** Yönetici raporu: son N gün, kullanıcı bazında toplam. */
export async function usageReport(days = 30) {
  const since = utcDay(new Date(Date.now() - (days - 1) * 86_400_000));
  const rows = await prisma.claudeUsage.findMany({ where: { day: { gte: since } }, include: { user: { select: { id: true, name: true, email: true } } } });
  const today = utcDay();
  const byUser = new Map<string, { userId: string; name: string; email: string; inputTokens: number; outputTokens: number; requests: number; chats: number; todayTokens: number }>();
  for (const r of rows) {
    const e = byUser.get(r.userId) ?? { userId: r.userId, name: r.user.name, email: r.user.email, inputTokens: 0, outputTokens: 0, requests: 0, chats: 0, todayTokens: 0 };
    e.inputTokens += Number(r.inputTokens);
    e.outputTokens += Number(r.outputTokens);
    e.requests += r.requests;
    e.chats += r.chats;
    if (r.day === today) e.todayTokens += Number(r.inputTokens + r.outputTokens);
    byUser.set(r.userId, e);
  }
  const users = [...byUser.values()].sort((a, b) => b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens));
  return {
    days,
    limits: claudeLimits(),
    totals: users.reduce(
      (t, u) => ({ inputTokens: t.inputTokens + u.inputTokens, outputTokens: t.outputTokens + u.outputTokens, requests: t.requests + u.requests, chats: t.chats + u.chats }),
      { inputTokens: 0, outputTokens: 0, requests: 0, chats: 0 }
    ),
    users,
  };
}
