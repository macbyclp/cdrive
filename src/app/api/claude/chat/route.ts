import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { errorResponse, limitOr429 } from "@/lib/api-helpers";
import { claudeConfig, signToolToken } from "@/lib/claude";

// Uzun ömürlü akış: yanıt, Claude sidecar'ından gelen Server-Sent Events'i olduğu gibi iletir.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const bodySchema = z.object({
  message: z.string().trim().min(1).max(4000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(6000) }))
    .max(12)
    .optional(),
});

// Kullanıcı başına eşzamanlı sohbet sınırı (Claude CLI süreçleri pahalı; tek Node süreci varsayımı).
const active = new Map<string, number>();
const MAX_CONCURRENT_PER_USER = 2;

/**
 * Claude yardımcısı: kullanıcının mesajını sidecar'a ("cdrive-claude") iletir. Sidecar, Claude CLI'ı
 * yalnızca Cdrive araçlarıyla (listele/ara/oku/öner) çalıştırır; araçlar bu kullanıcının yetkileriyle
 * işler. Claude dosyalara doğrudan yazamaz — düzenlemeler "öneri" olarak gelir, kullanıcı onaylar.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const cfg = claudeConfig();
    if (!cfg) {
      return NextResponse.json({ error: "Claude yardımcısı yapılandırılmamış (CLAUDE_URL / CLAUDE_TOKEN)" }, { status: 503 });
    }
    const limited = limitOr429("claude-chat", user.id, 12, 60_000);
    if (limited) return limited;
    const body = bodySchema.parse(await req.json());

    const running = active.get(user.id) ?? 0;
    if (running >= MAX_CONCURRENT_PER_USER) {
      return NextResponse.json({ error: "Zaten devam eden sohbetleriniz var; biraz bekleyin" }, { status: 429 });
    }

    const runId = randomUUID();
    const toolToken = await signToolToken(user.id, runId);
    active.set(user.id, running + 1);
    const release = () => active.set(user.id, Math.max(0, (active.get(user.id) ?? 1) - 1));

    let upstream: Response;
    try {
      upstream = await fetch(`${cfg.url}/run`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          runId,
          toolToken,
          message: body.message,
          history: body.history ?? [],
          user: { name: user.name, role: user.role },
        }),
        signal: req.signal,
      });
    } catch {
      release();
      return NextResponse.json({ error: "Claude servisine ulaşılamıyor" }, { status: 502 });
    }
    if (!upstream.ok || !upstream.body) {
      release();
      const d = (await upstream.json().catch(() => ({}))) as { error?: string };
      return NextResponse.json(
        { error: d.error ?? `Claude servisi hata döndürdü (${upstream.status})` },
        { status: upstream.status === 429 ? 429 : 502 }
      );
    }

    // Akış bitince/kopunca eşzamanlılık sayacını düşür.
    const reader = upstream.body.getReader();
    const stream = new ReadableStream({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            release();
            controller.close();
          } else controller.enqueue(value);
        } catch {
          release();
          controller.close();
        }
      },
      cancel() {
        release();
        void reader.cancel().catch(() => {});
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Yapılandırma durumu — panel açılırken "kurulu mu?" göstermek için (ayrıntı sızdırmaz). */
export async function GET() {
  try {
    await requireUser();
    return NextResponse.json({ configured: !!claudeConfig() });
  } catch (err) {
    return errorResponse(err);
  }
}
