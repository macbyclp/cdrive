import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { errorResponse, limitOr429 } from "@/lib/api-helpers";
import { claudeKeyStatus, isValidApiKeyFormat, setClaudeApiKey } from "@/lib/claude-key";
import { verifyApiKey } from "@/lib/claude-agent";

// Sistem geneli Claude API anahtarı (yalnızca ADMIN). Anahtar yanıtlarda ASLA dönmez; yalnızca durum + son 4 hane.

export async function GET() {
  try {
    await requireRole("ADMIN");
    return NextResponse.json(await claudeKeyStatus());
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
    return NextResponse.json(await claudeKeyStatus());
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE() {
  try {
    const admin = await requireRole("ADMIN");
    await setClaudeApiKey(null);
    await logAudit({ userId: admin.id, action: "SETTINGS_UPDATE", detail: "Sistem Claude API anahtarı silindi" });
    return NextResponse.json(await claudeKeyStatus());
  } catch (err) {
    return errorResponse(err);
  }
}
