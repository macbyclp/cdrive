// Sistem geneli Claude API anahtarının saklanması (yalnızca yönetici girer). Anahtar veritabanında AES-256-GCM ile şifrelenir;
// şifre çözme anahtarı SESSION_SECRET'tan türetilir (veritabanı yedeği tek başına anahtarları açığa çıkarmaz).
// Anahtar API yanıtlarında ASLA dönmez; arayüze yalnızca "kayıtlı mı + son 4 hane" gösterilir.

import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { resolveSecret } from "@/lib/session-secret";

const KEY_RE = /^sk-ant-[A-Za-z0-9_-]{20,300}$/;

export function isValidApiKeyFormat(key: string): boolean {
  return KEY_RE.test(key);
}

function encKey(): Buffer {
  return createHmac("sha256", resolveSecret()).update("claude-api-key-v1").digest();
}

export function encryptApiKey(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", encKey(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), ct.toString("base64")].join(":");
}

export function decryptApiKey(blob: string): string | null {
  try {
    const [v, iv, tag, ct] = blob.split(":");
    if (v !== "v1" || !iv || !tag || !ct) return null;
    const d = createDecipheriv("aes-256-gcm", encKey(), Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]).toString("utf8");
  } catch {
    return null; // SESSION_SECRET değişmişse/bozuksa: kullanıcı anahtarı yeniden girer
  }
}

/** Sistem geneli anahtar: önce yönetici panelinde girilen (DB, şifreli), yoksa ANTHROPIC_API_KEY ortam değişkeni. */
export async function getClaudeApiKey(): Promise<string | null> {
  const row = await prisma.systemSettings.findUnique({ where: { id: 1 }, select: { claudeApiKeyEnc: true } });
  const fromDb = row?.claudeApiKeyEnc ? decryptApiKey(row.claudeApiKeyEnc) : null;
  if (fromDb) return fromDb;
  const env = process.env.ANTHROPIC_API_KEY?.trim();
  return env && isValidApiKeyFormat(env) ? env : null;
}

/** Yönetici ekranı için durum (anahtarın kendisi dönmez): nereden geldiği ve son 4 hane. */
export async function claudeKeyStatus(): Promise<{ configured: boolean; source: "panel" | "env" | null; last4: string | null }> {
  const row = await prisma.systemSettings.findUnique({ where: { id: 1 }, select: { claudeApiKeyEnc: true } });
  const fromDb = row?.claudeApiKeyEnc ? decryptApiKey(row.claudeApiKeyEnc) : null;
  if (fromDb) return { configured: true, source: "panel", last4: fromDb.slice(-4) };
  const env = process.env.ANTHROPIC_API_KEY?.trim();
  if (env && isValidApiKeyFormat(env)) return { configured: true, source: "env", last4: env.slice(-4) };
  return { configured: false, source: null, last4: null };
}

export async function setClaudeApiKey(key: string | null): Promise<void> {
  const claudeApiKeyEnc = key ? encryptApiKey(key) : null;
  await prisma.systemSettings.upsert({ where: { id: 1 }, create: { id: 1, claudeApiKeyEnc }, update: { claudeApiKeyEnc } });
}
