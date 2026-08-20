"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import Avatar from "@/components/Avatar";
import FilePickerDialog from "@/components/FilePickerDialog";
import { useMe } from "@/lib/useMe";
import { useToast } from "@/components/ToastProvider";
import { withBasePath } from "@/lib/basePath";
import { formatBytesStr, iconForMime } from "@/lib/format";
import { isChatSoundEnabled, playReceivedSound, playSentSound, setChatSoundEnabled } from "@/lib/chat-sound";

type Channel = { id: string; name: string; lastMessageAt: string | null; unread: boolean };
type Dm = {
  userId: string;
  name: string;
  avatarKey: string | null;
  avatarParts: string | null;
  lastMessageAt: string;
  preview: string;
  unread: boolean;
};
type Contact = { id: string; name: string; avatarKey: string | null; avatarParts: string | null };
type ContactsResponse = { channels: Channel[]; dms: Dm[]; allUsers: Contact[] };

type ChatFile = { id: string; name: string; mimeType: string; size: string };

type Message = {
  id: string;
  content: string;
  createdAt: string;
  channelId: string | null;
  recipientId: string | null;
  sender: { id: string; name: string; avatarKey: string | null; avatarParts: string | null };
  file: ChatFile | null;
};

type Active = { type: "channel"; id: string; name: string } | { type: "dm"; id: string; name: string; avatarKey: string | null; avatarParts: string | null };

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

export default function ChatScreen() {
  const { user, refresh } = useMe();
  const toast = useToast();
  const [contacts, setContacts] = useState<ContactsResponse | null>(null);
  const [active, setActive] = useState<Active | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [showNewDm, setShowNewDm] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [uploading, setUploading] = useState(false);
  const activeRef = useRef<Active | null>(null);
  const userIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    userIdRef.current = user?.id ?? null;
  }, [user]);

  // localStorage sadece istemcide okunabilir — sunucu tarafı render ile aynı çıksın
  // diye ilk render'da varsayılan true, tercih mount sonrası senkronlanıyor.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage sadece istemcide okunabilir, hydration uyumsuzluğunu önlemek için mount sonrası senkronlanıyor
    setSoundOn(isChatSoundEnabled());
  }, []);

  function toggleSound() {
    setSoundOn((s) => {
      const next = !s;
      setChatSoundEnabled(next);
      return next;
    });
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadContacts() {
    fetch(withBasePath("/api/chat/contacts"))
      .then((r) => r.json())
      .then(setContacts)
      .catch(() => {});
  }

  useEffect(() => {
    loadContacts();
  }, []);

  function markRead(target: Active) {
    fetch(withBasePath("/api/chat/read"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(target.type === "channel" ? { channelId: target.id } : { dmUserId: target.id }),
    }).catch(() => {});
  }

  // SSE: tek bağlantı, kurum-içi sohbetin "gerçek zamanlı" ucu (bkz. src/lib/chat-events.ts).
  useEffect(() => {
    const es = new EventSource(withBasePath("/api/chat/stream"));
    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === "ready") return;
      const cur = activeRef.current;
      const belongsToActive =
        cur &&
        ((cur.type === "channel" && data.channelId === cur.id) ||
          (cur.type === "dm" && !data.channelId && (data.senderId === cur.id || data.recipientId === cur.id)));
      if (belongsToActive) {
        setMessages((prev) => [
          ...prev,
          {
            id: data.id,
            content: data.content,
            createdAt: data.createdAt,
            channelId: data.channelId,
            recipientId: data.recipientId,
            sender: { id: data.senderId, name: data.senderName, avatarKey: data.senderAvatarKey, avatarParts: data.senderAvatarParts },
            file: data.file ?? null,
          },
        ]);
        markRead(cur);
      }
      if (data.senderId !== userIdRef.current) playReceivedSound();
      loadContacts();
    };
    return () => es.close();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) setShowAttachMenu(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function openConversation(target: Active) {
    setActive(target);
    setShowNewDm(false);
    const qs = target.type === "channel" ? `channelId=${target.id}` : `dmUserId=${target.id}`;
    fetch(withBasePath(`/api/chat/messages?${qs}`))
      .then((r) => r.json())
      .then((d) => setMessages(d));
    markRead(target);
    loadContacts();
  }

  async function send() {
    const text = input.trim();
    if (!text || !active || busy) return;
    setInput("");
    setBusy(true);
    const res = await fetch(withBasePath("/api/chat/messages"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        active.type === "channel" ? { content: text, channelId: active.id } : { content: text, recipientId: active.id }
      ),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast(d.error ?? "Mesaj gönderilemedi", "error");
      setInput(text);
      return;
    }
    playSentSound();
    // Ekrana ekleme SSE'nin işi — kendi bağlantımız da mesajı anında geri alır.
  }

  /** Var olan bir Sürücü dosyasını veya yeni yüklenmiş bir dosyayı mesaj olarak gönderir. */
  async function sendFile(fileId: string, target: Active) {
    const res = await fetch(withBasePath("/api/chat/messages"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        target.type === "channel" ? { fileId, channelId: target.id } : { fileId, recipientId: target.id }
      ),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast(d.error ?? "Dosya gönderilemedi", "error");
      return;
    }
    playSentSound();
  }

  /** Sürücü'de var olan dosyalardan seçim — FilePickerDialog çoklu seçime izin veriyor, her biri ayrı mesaj olarak gönderiliyor. */
  async function attachFromDrive(files: { id: string; name: string; mimeType: string }[]) {
    setShowFilePicker(false);
    if (!active) return;
    for (const f of files) await sendFile(f.id, active);
  }

  /** Bilgisayardan yeni dosya yükleme — önce normal /api/files'a (kullanıcının kendi Sürücü köküne) yüklenir, sonra mesaj olarak gönderilir. */
  async function uploadAndSend(fileList: FileList | null) {
    if (!fileList || fileList.length === 0 || !active) return;
    setUploading(true);
    for (const file of Array.from(fileList)) {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(withBasePath("/api/files"), { method: "POST", body: fd });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast(`${file.name}: ${d.error ?? "yüklenemedi"}`, "error");
        continue;
      }
      const uploaded = await res.json();
      await sendFile(uploaded.id, active);
    }
    setUploading(false);
    refresh(); // kota göstergesi güncellensin
  }

  async function createChannel(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(withBasePath("/api/chat/channels"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newChannelName.trim() }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast(d.error ?? "Kanal oluşturulamadı", "error");
      return;
    }
    setNewChannelName("");
    setShowNewChannel(false);
    loadContacts();
  }

  const canManageChannels = user && (user.role === "ADMIN" || user.role === "MANAGER");

  const filteredUsers = useMemo(() => {
    if (!contacts) return [];
    const q = userSearch.trim().toLowerCase();
    return contacts.allUsers.filter((u) => !q || u.name.toLowerCase().includes(q));
  }, [contacts, userSearch]);

  if (!user) return null;

  return (
    <AppShell user={user} active="chat">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
              Sohbet
              <span className="badge text-[10px] font-semibold uppercase" style={{ color: "var(--accent)" }}>
                Beta
              </span>
            </h1>
            <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
              Kurum içi kanallar ve birebir mesajlaşma — gerçek zamanlı.
            </p>
          </div>
          <button
            className="btn-ghost shrink-0 text-sm"
            onClick={toggleSound}
            title={soundOn ? "Bildirim sesini kapat" : "Bildirim sesini aç"}
          >
            {soundOn ? "🔊" : "🔇"}
          </button>
        </div>

        <div className="flex gap-4" style={{ height: "70vh" }}>
          <div className="flex w-64 shrink-0 flex-col overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)" }}>
            <div className="flex-1 overflow-y-auto p-2">
              <div className="mb-1 flex items-center justify-between px-2 pt-1">
                <span className="text-xs font-semibold uppercase" style={{ color: "var(--text-tertiary)" }}>
                  Kanallar
                </span>
                {canManageChannels && (
                  <button className="text-xs" style={{ color: "var(--accent)" }} onClick={() => setShowNewChannel((s) => !s)}>
                    + Yeni
                  </button>
                )}
              </div>
              {showNewChannel && (
                <form onSubmit={createChannel} className="mb-2 flex gap-1 px-2">
                  <input
                    autoFocus
                    className="input min-w-0 flex-1 text-sm"
                    placeholder="kanal-adi"
                    value={newChannelName}
                    onChange={(e) => setNewChannelName(e.target.value.toLowerCase())}
                  />
                  <button type="submit" className="btn-primary shrink-0 px-2 text-sm" disabled={!newChannelName.trim()}>
                    Oluştur
                  </button>
                </form>
              )}
              {contacts?.channels.map((c) => (
                <button
                  key={c.id}
                  onClick={() => openConversation({ type: "channel", id: c.id, name: c.name })}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm"
                  style={
                    active?.type === "channel" && active.id === c.id
                      ? { background: "var(--accent-soft)", color: "var(--accent-soft-foreground)" }
                      : { color: "var(--text-primary)" }
                  }
                >
                  <span># {c.name}</span>
                  {c.unread && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--accent)" }} />}
                </button>
              ))}
              {contacts && contacts.channels.length === 0 && (
                <p className="px-2 py-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
                  Henüz kanal yok.
                </p>
              )}

              <div className="mb-1 mt-3 flex items-center justify-between px-2">
                <span className="text-xs font-semibold uppercase" style={{ color: "var(--text-tertiary)" }}>
                  Kişiler
                </span>
                <button className="text-xs" style={{ color: "var(--accent)" }} onClick={() => setShowNewDm((s) => !s)}>
                  + Yeni
                </button>
              </div>
              {showNewDm && (
                <div className="mb-2 px-2">
                  <input
                    autoFocus
                    className="input text-sm"
                    placeholder="Kullanıcı ara…"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                  />
                  <div className="mt-1 max-h-40 overflow-y-auto">
                    {filteredUsers.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => openConversation({ type: "dm", id: u.id, name: u.name, avatarKey: u.avatarKey, avatarParts: u.avatarParts })}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:opacity-80"
                        style={{ color: "var(--text-primary)" }}
                      >
                        <Avatar name={u.name} email={u.id} avatarKey={u.avatarKey} avatarParts={u.avatarParts} size={20} />
                        {u.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {contacts?.dms.map((d) => (
                <button
                  key={d.userId}
                  onClick={() => openConversation({ type: "dm", id: d.userId, name: d.name, avatarKey: d.avatarKey, avatarParts: d.avatarParts })}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm"
                  style={
                    active?.type === "dm" && active.id === d.userId
                      ? { background: "var(--accent-soft)", color: "var(--accent-soft-foreground)" }
                      : { color: "var(--text-primary)" }
                  }
                >
                  <Avatar name={d.name} email={d.userId} avatarKey={d.avatarKey} avatarParts={d.avatarParts} size={20} />
                  <span className="min-w-0 flex-1 truncate">{d.name}</span>
                  {d.unread && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--accent)" }} />}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-1 flex-col overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)" }}>
            {!active ? (
              <div className="flex flex-1 items-center justify-center">
                <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                  Başlamak için soldan bir kanal veya kişi seç.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
                  {active.type === "dm" && <Avatar name={active.name} email={active.id} avatarKey={active.avatarKey} avatarParts={active.avatarParts} size={28} />}
                  <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                    {active.type === "channel" ? `# ${active.name}` : active.name}
                  </span>
                </div>
                <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
                  {messages.map((m) => {
                    const mine = m.sender.id === user.id;
                    return (
                      <div key={m.id} className={`flex gap-2 ${mine ? "flex-row-reverse" : ""}`}>
                        <Avatar name={m.sender.name} email={m.sender.id} avatarKey={m.sender.avatarKey} avatarParts={m.sender.avatarParts} size={28} />
                        <div className={`max-w-[70%] ${mine ? "items-end" : "items-start"} flex flex-col`}>
                          {!mine && active.type === "channel" && (
                            <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                              {m.sender.name}
                            </span>
                          )}
                          {m.content && (
                            <div
                              className="rounded-2xl px-3 py-2 text-sm"
                              style={
                                mine
                                  ? { background: "var(--accent)", color: "#fff" }
                                  : { background: "var(--surface-muted)", color: "var(--text-primary)" }
                              }
                            >
                              {m.content}
                            </div>
                          )}
                          {m.file && (
                            <a
                              href={withBasePath(`/api/files/${m.file.id}`)}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-1 flex items-center gap-2 rounded-xl border px-3 py-2 text-sm hover:opacity-80"
                              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                            >
                              <span className="text-lg">{iconForMime(m.file.mimeType)}</span>
                              <span className="min-w-0">
                                <span className="block truncate font-medium" style={{ color: "var(--text-primary)" }}>
                                  {m.file.name}
                                </span>
                                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                                  {formatBytesStr(m.file.size)}
                                </span>
                              </span>
                            </a>
                          )}
                          <span className="mt-0.5 text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                            {formatTime(m.createdAt)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {messages.length === 0 && (
                    <p className="text-center text-sm" style={{ color: "var(--text-tertiary)" }}>
                      Henüz mesaj yok — ilk mesajı sen yaz.
                    </p>
                  )}
                </div>
                <form
                  className="flex gap-2 border-t p-3"
                  style={{ borderColor: "var(--border)" }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    send();
                  }}
                >
                  <div className="relative shrink-0" ref={attachMenuRef}>
                    <button
                      type="button"
                      disabled={uploading}
                      className="btn-secondary px-2.5"
                      title="Dosya ekle"
                      onClick={() => setShowAttachMenu((s) => !s)}
                    >
                      {uploading ? "…" : "📎"}
                    </button>
                    {showAttachMenu && (
                      <div
                        className="absolute bottom-full left-0 z-30 mb-1 w-48 overflow-hidden rounded-lg border py-1 shadow-lg"
                        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
                      >
                        <button
                          type="button"
                          className="block w-full px-3 py-2 text-left text-sm hover:opacity-80"
                          style={{ color: "var(--text-primary)" }}
                          onClick={() => {
                            setShowAttachMenu(false);
                            setShowFilePicker(true);
                          }}
                        >
                          🗂️ Sürücüden ekle
                        </button>
                        <button
                          type="button"
                          className="block w-full px-3 py-2 text-left text-sm hover:opacity-80"
                          style={{ color: "var(--text-primary)" }}
                          onClick={() => {
                            setShowAttachMenu(false);
                            fileInputRef.current?.click();
                          }}
                        >
                          ⬆ Bilgisayardan yükle
                        </button>
                      </div>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        uploadAndSend(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </div>
                  <input
                    className="input flex-1"
                    placeholder="Mesaj yaz…"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                  />
                  <button disabled={busy || !input.trim()} className="btn-primary shrink-0">
                    Gönder
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>

      {showFilePicker && (
        <FilePickerDialog onCancel={() => setShowFilePicker(false)} onConfirm={attachFromDrive} />
      )}
    </AppShell>
  );
}
