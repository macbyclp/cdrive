import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { errorResponse, limitOr429 } from "@/lib/api-helpers";
import { DEFAULT_TOKEN_DAYS, MAX_TOKEN_DAYS, createApiToken } from "@/lib/agent-token";

// Kişisel erişim anahtarlarını YALNIZCA oturum açmış kullanıcı yönetir (anahtarla anahtar üretilemez).

function serialize(t: { id: string; name: string; prefix: string; expiresAt: Date; lastUsedAt: Date | null; lastUsedAgent: string | null; createdAt: Date }) {
  return {
    id: t.id,
    name: t.name,
    prefix: t.prefix,
    expiresAt: t.expiresAt.toISOString(),
    lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
    lastUsedAgent: t.lastUsedAgent,
    createdAt: t.createdAt.toISOString(),
  };
}

export async function GET() {
  try {
    const user = await requireUser();
    const rows = await prisma.apiToken.findMany({
      where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ tokens: rows.map(serialize) });
  } catch (err) {
    return errorResponse(err);
  }
}

const postSchema = z.object({
  name: z.string().trim().min(1).max(60),
  days: z.number().int().min(1).max(MAX_TOKEN_DAYS).optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const limited = limitOr429("api-token-create", user.id, 10, 3_600_000);
    if (limited) return limited;
    const { name, days } = postSchema.parse(await req.json());
    const { token, row } = await createApiToken(user.id, name, days ?? DEFAULT_TOKEN_DAYS);
    await logAudit({ userId: user.id, action: "SETTINGS_UPDATE", detail: `Yapay zekâ erişim anahtarı oluşturuldu: ${row.name}` });
    // Anahtarın tamamı YALNIZCA bu yanıtta döner.
    return NextResponse.json({ token, ...serialize(row) }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
