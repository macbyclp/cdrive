import { EventEmitter } from "events";

/**
 * Tek process içi (in-memory) olay yayıcı — /api/chat/messages yeni bir mesaj
 * oluşturunca burada "message" olayı yayar, /api/chat/stream'e bağlı her açık
 * SSE bağlantısı bunu dinleyip kendi kullanıcısıyla ilgiliyse (bkz.
 * isRelevantChatEvent) istemciye anında iletir. Ayrı bir WebSocket/Redis
 * gerektirmez ama TEK production process varsayımına dayanır — Cdrive tek bir
 * `cdrive-app` container'ı olarak çalıştığı için (bkz. docker-compose.yml)
 * bu varsayım şimdilik güvenli. Yatay ölçeklenirse (birden fazla instance)
 * bu emitter'ı Redis pub/sub gibi paylaşımlı bir mekanizmayla değiştirmek
 * gerekir — beta kapsamında bilerek ertelendi.
 */
const globalForChat = globalThis as unknown as { chatEmitter?: EventEmitter };

export const chatEmitter = globalForChat.chatEmitter ?? new EventEmitter();
chatEmitter.setMaxListeners(0); // sınırsız — her açık SSE sekmesi bir listener

if (process.env.NODE_ENV !== "production") globalForChat.chatEmitter = chatEmitter;

export type ChatEventPayload = {
  id: string;
  content: string;
  createdAt: string;
  senderId: string;
  senderName: string;
  senderAvatarKey: string | null;
  senderAvatarParts: string | null;
  channelId: string | null;
  recipientId: string | null;
  file: { id: string; name: string; mimeType: string; size: string } | null;
};

/** Bir mesaj olayının bu kullanıcıya iletilip iletilmeyeceği — DM sızıntısını burada önlüyoruz. */
export function isRelevantChatEvent(event: ChatEventPayload, userId: string): boolean {
  if (event.channelId) return true; // kanallar herkese açık (beta: üyelik yok)
  return event.senderId === userId || event.recipientId === userId;
}

export function publishChatMessage(event: ChatEventPayload) {
  chatEmitter.emit("message", event);
}
