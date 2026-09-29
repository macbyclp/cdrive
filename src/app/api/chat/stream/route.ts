import { requireUser, getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api-helpers";
import { chatEmitter, isRelevantChatEvent, type ChatEventPayload } from "@/lib/chat-events";

export const dynamic = "force-dynamic";

/**
 * Sohbetin "gerçek zamanlı" ucu — Server-Sent Events. Ayrı bir WebSocket
 * sunucusu/altyapısı gerektirmez (bkz. src/lib/chat-events.ts'teki gerekçe),
 * mevcut standalone Next.js deploy'una hiç dokunmadan çalışır. Her açık
 * sekme burada tek bir uzun ömürlü GET bağlantısı tutar; yeni bir mesaj
 * oluştuğunda (POST /api/chat/messages) process-içi EventEmitter üzerinden
 * anında buraya düşer ve istemciye push edilir.
 */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const sessionId = (await getSession())?.sessionId ?? null;

    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        const send = (data: unknown) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch {
            // controller zaten kapanmışsa (istemci bağlantıyı kestiyse) sessizce yok say
          }
        };

        // Oturum iptal edilirse / hesap pasifleşirse akış kesilir (bağlantı açılırken bir kez
        // doğrulamak yetmez: ele geçirilmiş oturum kapatılsa da mesaj almaya devam ederdi).
        let valid = true;
        const onMessage = (event: ChatEventPayload) => {
          if (valid && isRelevantChatEvent(event, user.id)) send(event);
        };
        chatEmitter.on("message", onMessage);

        // Caddy/tarayıcı boşta kalan bağlantıyı zaman aşımına uğratmasın diye
        // periyodik yorum satırı (SSE'de veri sayılmaz, sadece bağlantıyı canlı tutar).
        const heartbeat = setInterval(async () => {
          try {
            const [record, current] = await Promise.all([
              sessionId ? prisma.session.findUnique({ where: { id: sessionId }, select: { revokedAt: true } }) : null,
              prisma.user.findUnique({ where: { id: user.id }, select: { active: true } }),
            ]);
            if (!record || record.revokedAt || !current?.active) {
              valid = false;
              cleanup();
              return;
            }
            controller.enqueue(encoder.encode(": ping\n\n"));
          } catch {
            clearInterval(heartbeat);
          }
        }, 15_000);

        send({ type: "ready" });

        const cleanup = () => {
          clearInterval(heartbeat);
          chatEmitter.off("message", onMessage);
          try {
            controller.close();
          } catch {
            // zaten kapalı
          }
        };
        req.signal.addEventListener("abort", cleanup);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
