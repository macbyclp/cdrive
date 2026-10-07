import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { errorResponse, limitOr429 } from "@/lib/api-helpers";
import { getUserApiKey, isValidApiKeyFormat, setUserApiKey } from "@/lib/claude-key";
import { verifyApiKey } from "@/lib/claude-agent";

// Kullanıcının kendi Claude API anahtarı. Anahtar yanıtlarda ASLA dönmez; yalnızca durum + son 4 hane.

export async function GET() {
  try {
    const user = await requireUser();
    const key = await getUserApiKey(user.id);
    return NextResponse.json({ configured: !!key, last4: key ? key.slice(-4) : null });
  } catch (err) {
    return errorResponse(err);
  }
}

const putSchema = z.object({ apiKey: z.string().trim().min(20).max(400) });

export async function PUT(req: Request) {
  try {
    const user = await requireUser();
    const limited = limitOr429("claude-key", user.id, 10, 60_000);
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
    await setUserApiKey(user.id, apiKey);
    await logAudit({ userId: user.id, action: "SETTINGS_UPDATE", detail: "Claude API anahtarı kaydedildi" });
    return NextResponse.json({ configured: true, last4: apiKey.slice(-4) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE() {
  try {
    const user = await requireUser();
    await setUserApiKey(user.id, null);
    await logAudit({ userId: user.id, action: "SETTINGS_UPDATE", detail: "Claude API anahtarı silindi" });
    return NextResponse.json({ configured: false, last4: null });
  } catch (err) {
    return errorResponse(err);
  }
}
