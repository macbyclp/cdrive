import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { errorResponse, limitOr429 } from "@/lib/api-helpers";
import { getClaudeApiKey } from "@/lib/claude-key";
import { runAgent, type AgentEvent } from "@/lib/claude-agent";
import { checkQuota, claudeAccess, recordChatStart, recordUsage } from "@/lib/claude-usage";

// Uzun ömürlü akış: ajan adımları Server-Sent Events olarak iletilir.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const bodySchema = z.object({
  message: z.string().trim().min(1).max(4000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(6000) }))
    .max(12)
    .optional(),
});

// Kullanıcı başına eşzamanlı sohbet sınırı (tek Node süreci varsayımı).
const active = new Map<string, number>();
const MAX_CONCURRENT_PER_USER = 2;

/**
 * Claude yardımcısı: yöneticinin girdiği sistem geneli Claude API anahtarıyla çalışır. Araçlar bu kullanıcının
 * yetkileriyle işler; Claude dosyalara doğrudan yazamaz — düzenlemeler "öneri" olarak gelir, kullanıcı onaylar.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const access = await claudeAccess(user);
    if (!access.ok) return NextResponse.json({ error: access.message, reason: access.reason }, { status: access.status });
    const apiKey = (await getClaudeApiKey())!;
    const limited = limitOr429("claude-chat", user.id, 12, 60_000);
    if (limited) return limited;
    // Anahtar herkesin ortak kullandığı tek hesap olduğundan, kişi başına saatlik üst sınır da var (maliyet koruması).
    const hourly = limitOr429("claude-chat-hour", user.id, 60, 3_600_000);
    if (hourly) return hourly;
    const body = bodySchema.parse(await req.json());
    const overQuota = await checkQuota(user.id);
    if (overQuota) return NextResponse.json({ error: overQuota, reason: "quota" }, { status: 429 });

    const running = active.get(user.id) ?? 0;
    if (running >= MAX_CONCURRENT_PER_USER) {
      return NextResponse.json({ error: "Zaten devam eden sohbetleriniz var; biraz bekleyin" }, { status: 429 });
    }
    await recordChatStart(user.id);
    active.set(user.id, running + 1);
    const release = () => active.set(user.id, Math.max(0, (active.get(user.id) ?? 1) - 1));

    const enc = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let closed = false;
        const send = (obj: object) => {
          if (!closed) controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
        };
        send({ type: "ready" });
        try {
          await runAgent({
            user,
            apiKey,
            message: body.message,
            history: body.history,
            signal: req.signal,
            beforeTurn: () => checkQuota(user.id),
            onUsage: (u) => recordUsage(user.id, u),
            emit: (e: AgentEvent) => send(e),
          });
        } catch {
          send({ type: "error", message: "Beklenmeyen bir hata oluştu" });
        } finally {
          release();
          send({ type: "done" });
          closed = true;
          try {
            controller.close();
          } catch {
            /* istemci zaten gitmiş olabilir */
          }
        }
      },
      cancel() {
        /* istemci koptu: req.signal ajanı durdurur, sayaç finally'de düşer */
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Panel açılırken: kullanılabilir mi? (anahtarın kendisi asla dönmez) reason: disabled | role | unconfigured | quota */
export async function GET() {
  try {
    const user = await requireUser();
    const access = await claudeAccess(user);
    if (!access.ok) return NextResponse.json({ configured: false, reason: access.reason });
    const quota = await checkQuota(user.id);
    return NextResponse.json({ configured: !quota, reason: quota ? "quota" : null });
  } catch (err) {
    return errorResponse(err);
  }
}
