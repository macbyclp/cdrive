import { EventEmitter } from "events";

/**
 * Tek process içi (in-memory) olay yayıcı — /api/chat/messages yeni bir mesaj
 * oluşturunca (veya bir mesaj düzenlenip/silininca) burada "message" olayı yayar,
 * /api/chat/stream'e bağlı her açık SSE bağlantısı bunu dinleyip kendi
 * kullanıcısıyla ilgiliyse (bkz. isRelevantChatEvent) istemciye anında iletir.
 * Ayrı bir WebSocket/Redis gerektirmez ama TEK production process varsayımına
 * dayanır — Cdrive tek bir `cdrive-app` container'ı olarak çalıştığı için (bkz.
 * docker-compose.yml) bu varsayım şimdilik güvenli. Yatay ölçeklenirse (birden
 * fazla instance) bu emitter'ı Redis pub/sub gibi paylaşımlı bir mekanizmayla
 * değiştirmek gerekir — beta kapsamında bilerek ertelendi.
 */
const globalForChat = globalThis as unknown as { chatEmitter?: EventEmitter };

export const chatEmitter = globalForChat.chatEmitter ?? new EventEmitter();
chatEmitter.setMaxListeners(0); // sınırsız — her açık SSE sekmesi bir listener

if (process.env.NODE_ENV !== "production") globalForChat.chatEmitter = chatEmitter;

export type ChatEventPayload = {
  kind: "message" | "edit" | "delete";
  id: string;
  content: string;
  createdAt: string;
  editedAt: string | null;
  senderId: string;
  senderName: string;
  senderAvatarKey: string | null;
  senderAvatarParts: string | null;
  channelId: string | null;
  recipientId: string | null;
  file: { id: string; name: string; mimeType: string; size: string } | null;
  // Sadece gizli (isPrivate) kanal mesajlarında dolu — bu olayın hangi kullanıcılara
  // iletileceğini burada, üyelik DB sorgusu yapmadan (tek process varsayımıyla tutarlı,
  // her SSE bağlantısı için ayrı bir DB sorgusu gerektirmeden) belirlemek için.
  channelPrivate: boolean;
  channelMemberIds: string[] | null;
};

/** Bir mesaj olayının bu kullanıcıya iletilip iletilmeyeceği — DM/gizli-kanal sızıntısını burada önlüyoruz. */
export function isRelevantChatEvent(event: ChatEventPayload, userId: string): boolean {
  if (event.channelId) {
    if (event.channelPrivate) return !!event.channelMemberIds?.includes(userId);
    return true; // herkese açık kanal
  }
  return event.senderId === userId || event.recipientId === userId;
}

export function publishChatEvent(event: ChatEventPayload) {
  chatEmitter.emit("message", event);
}

/** Geriye dönük kolaylık: yeni mesaj olayı yayınlar (kind="message"). */
export function publishChatMessage(event: Omit<ChatEventPayload, "kind" | "editedAt">) {
  publishChatEvent({ ...event, kind: "message", editedAt: null });
}
