// Yapay zekâ araçları (Claude Code, Codex, MCP istemcileri) için kişisel erişim anahtarları.
// Anahtar yalnızca /api/agent/* uçlarında geçerlidir (yükle/listele/ara/oku); oturum açma, ayar, silme,
// paylaşım vb. hiçbir şeyi yapamaz. Veritabanında yalnızca SHA-256 özeti tutulur; anahtar oluşturulurken bir kez gösterilir.

import { createHash, randomBytes } from "node:crypto";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AuthError } from "@/lib/auth";

export const TOKEN_PREFIX = "cdrv_";
export const MAX_ACTIVE_TOKENS = 10;
export const DEFAULT_TOKEN_DAYS = 90;
export const MAX_TOKEN_DAYS = 365;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateToken(): string {
  return TOKEN_PREFIX + randomBytes(32).toString("base64url");
}

/** Bildirimde/denetimde görünen ajan adı: bilinenler güzel yazılır, geri kalan temizlenip kısaltılır. */
const KNOWN_AGENTS: Record<string, string> = {
  "claude-code": "Claude Code",
  claude: "Claude",
  codex: "Codex",
  "claude-desktop": "Claude Desktop",
  cursor: "Cursor",
  gemini: "Gemini",
};

export function agentLabel(raw: string | null | undefined): string {
  const key = String(raw ?? "").trim().toLowerCase();
  if (KNOWN_AGENTS[key]) return KNOWN_AGENTS[key];
  // Satır sonu/kontrol karakteri ve işaretlemeyi at: etiket bildirim metnine ve denetim kaydına girer.
  const clean = String(raw ?? "")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N} ._-]/gu, "")
    .trim()
    .slice(0, 40);
  return clean || "Yapay zekâ aracı";
}

export async function createApiToken(userId: string, name: string, days = DEFAULT_TOKEN_DAYS) {
  const active = await prisma.apiToken.count({ where: { userId, revokedAt: null, expiresAt: { gt: new Date() } } });
  if (active >= MAX_ACTIVE_TOKENS) throw new AuthError(`En fazla ${MAX_ACTIVE_TOKENS} etkin anahtarınız olabilir; eskilerini iptal edin`, 400);
  const token = generateToken();
  const expiresAt = new Date(Date.now() + Math.min(Math.max(days, 1), MAX_TOKEN_DAYS) * 86_400_000);
  const row = await prisma.apiToken.create({
    data: { userId, name: name.trim().slice(0, 60), tokenHash: hashToken(token), prefix: token.slice(0, 9), expiresAt },
  });
  return { token, row };
}

/** İstekteki "Authorization: Bearer cdrv_…" anahtarını doğrular; kullanıcıyı ve anahtar kaydını döner. */
export async function authenticateAgent(req: Request): Promise<{ user: User; tokenId: string; agent: string }> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token.startsWith(TOKEN_PREFIX) || token.length < 40 || token.length > 100) {
    throw new AuthError("Geçerli bir Cdrive erişim anahtarı gerekli", 401);
  }
  const row = await prisma.apiToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!row || row.revokedAt || row.expiresAt <= new Date()) throw new AuthError("Anahtar geçersiz, iptal edilmiş veya süresi dolmuş", 401);
  if (!row.user.active) throw new AuthError("Hesap pasif", 401);
  // Zorunlu ilk şifre değişimi bekleyen hesap, anahtarla da çalışamaz (oturum kapılarıyla aynı kural).
  if (row.user.mustChangePassword) throw new AuthError("Önce şifrenizi belirleyin", 403);

  const agent = agentLabel(req.headers.get("x-cdrive-agent"));
  // lastUsed güncellemesi her istekte yazma yapmasın: en fazla dakikada bir.
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000 || row.lastUsedAgent !== agent) {
    void prisma.apiToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date(), lastUsedAgent: agent } }).catch(() => {});
  }
  return { user: row.user, tokenId: row.id, agent };
}
