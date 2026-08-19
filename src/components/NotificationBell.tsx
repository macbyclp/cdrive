"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { withBasePath } from "@/lib/basePath";

type Notification = {
  id: string;
  message: string;
  read: boolean;
  targetType: string | null;
  targetId: string | null;
  createdAt: string;
};

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "az önce";
  if (mins < 60) return `${mins} dk önce`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} sa önce`;
  return `${Math.floor(hours / 24)} gün önce`;
}

export default function NotificationBell({ canManageOrders = false }: { canManageOrders?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  function load() {
    fetch(withBasePath("/api/notifications"))
      .then((r) => r.json())
      .then((d) => {
        setItems(d.notifications ?? []);
        setUnreadCount(d.unreadCount ?? 0);
      })
      .catch(() => {});
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function markAllRead() {
    await fetch(withBasePath("/api/notifications/read"), { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    load();
  }

  async function openNotification(n: Notification) {
    if (!n.read) {
      await fetch(withBasePath("/api/notifications/read"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: n.id }),
      });
      load();
    }
    setOpen(false);
    if (n.targetType === "order" && n.targetId) {
      router.push(canManageOrders ? `/accounting?open=${n.targetId}` : `/orders?open=${n.targetId}`);
    }
    else if (n.targetType === "folder" && n.targetId) router.push(`/drive?folder=${n.targetId}`);
    else router.push("/drive?view=shared");
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="btn-ghost relative" aria-label="Bildirimler">
        🔔
        {unreadCount > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white"
            style={{ background: "var(--danger)" }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-30 mt-1 w-80 overflow-hidden rounded-lg border shadow-lg"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <div className="flex items-center justify-between border-b px-3 py-2" style={{ borderColor: "var(--border)" }}>
            <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Bildirimler
            </span>
            {unreadCount > 0 && (
              <button className="btn-ghost text-xs" onClick={markAllRead}>
                Tümünü okundu yap
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 && (
              <p className="p-4 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>
                Henüz bildirim yok.
              </p>
            )}
            {items.map((n) => (
              <button
                key={n.id}
                onClick={() => openNotification(n)}
                className="block w-full border-b px-3 py-2.5 text-left text-sm last:border-0"
                style={{ borderColor: "var(--border)", background: n.read ? "transparent" : "var(--accent-soft)" }}
              >
                <p style={{ color: "var(--text-primary)" }}>{n.message}</p>
                <p className="mt-0.5 text-xs" style={{ color: "var(--text-tertiary)" }}>
                  {timeAgo(n.createdAt)}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
