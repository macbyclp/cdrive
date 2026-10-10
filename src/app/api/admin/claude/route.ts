import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { errorResponse, limitOr429 } from "@/lib/api-helpers";
import { claudeKeyStatus, isValidApiKeyFormat, setClaudeApiKey } from "@/lib/claude-key";
import { verifyApiKey } from "@/lib/claude-agent";
import { prisma } from "@/lib/prisma";
import { ALL_ROLES, claudeLimits, parseRoles } from "@/lib/claude-usage";

// Sistem geneli Claude API anahtarı (yalnızca ADMIN). Anahtar yanıtlarda ASLA dönmez; yalnızca durum + son 4 hane.

async function fullStatus() {
  const s = await prisma.systemSettings.findUnique({ where: { id: 1 }, select: { claudeEnabled: true, claudeRoles: true } });
  return {
    ...(await claudeKeyStatus()),
    enabled: s?.claudeEnabled ?? true,
    roles: parseRoles(s?.claudeRoles ?? ALL_ROLES.join(",")),
    limits: claudeLimits(),
  };
}

export async function GET() {
  try {
    await requireRole("ADMIN");
    return NextResponse.json(await fullStatus());
  } catch (err) {
    return errorResponse(err);
  }
}

const putSchema = z.object({ apiKey: z.string().trim().min(20).max(400) });

export async function PUT(req: Request) {
  try {
    const admin = await requireRole("ADMIN");
    const limited = limitOr429("claude-key", admin.id, 10, 60_000);
    if (limited) return limited;
    const { apiKey } = putSchema.parse(await req.json());
    if (!isValidApiKeyFormat(apiKey)) {
      return NextResponse.json({ error: "Anahtar biçimi geçersiz (sk-ant-… ile başlamalı)" }, { status: 400 });
    }
    const check = await verifyApiKey(apiKey);
    if (check === "invalid") return NextResponse.json({ error: "Anthropic bu anahtarı reddetti; kontrol edin" }, { status: 400 });
    if (check === "unreachable") {
      return NextResponse.json({ error: "Anahtar şu an doğrulanamadı (Anthropic'e ulaşılamadı); biraz sonra tekrar deneyin" }, { status: 502 });
    }
    await setClaudeApiKey(apiKey);
    await logAudit({ userId: admin.id, action: "SETTINGS_UPDATE", detail: "Sistem Claude API anahtarı kaydedildi" });
    return NextResponse.json(await fullStatus());
  } catch (err) {
    return errorResponse(err);
  }
}

const patchSchema = z.object({ enabled: z.boolean().optional(), roles: z.array(z.enum(["ADMIN", "MANAGER", "MEMBER"])).optional() });

/** Özelliği aç/kapat ve hangi rollerin kullanabileceğini belirle. */
export async function PATCH(req: Request) {
  try {
    const admin = await requireRole("ADMIN");
    const body = patchSchema.parse(await req.json());
    const data: { claudeEnabled?: boolean; claudeRoles?: string } = {};
    if (body.enabled !== undefined) data.claudeEnabled = body.enabled;
    if (body.roles !== undefined) data.claudeRoles = ALL_ROLES.filter((r) => body.roles!.includes(r)).join(",");
    await prisma.systemSettings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
    await logAudit({
      userId: admin.id,
      action: "SETTINGS_UPDATE",
      detail: `Claude: ${body.enabled !== undefined ? (body.enabled ? "açıldı" : "kapatıldı") : ""}${body.roles ? ` roller=${data.claudeRoles || "hiçbiri"}` : ""}`.trim(),
    });
    return NextResponse.json(await fullStatus());
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE() {
  try {
    const admin = await requireRole("ADMIN");
    await setClaudeApiKey(null);
    await logAudit({ userId: admin.id, action: "SETTINGS_UPDATE", detail: "Sistem Claude API anahtarı silindi" });
    return NextResponse.json(await fullStatus());
  } catch (err) {
    return errorResponse(err);
  }
}
