"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ToastProvider";

type Grant = { id: string; permission: "VIEW" | "EDIT"; user: { id: string; name: string; email: string } };
type Link = {
  id: string;
  token: string;
  revoked: boolean;
  expiresAt: string | null;
  maxDownloads: number | null;
  downloadCount: number;
};

export default function ShareDialog({
  targetType,
  targetId,
  targetName,
  onClose,
}: {
  targetType: "file" | "folder";
  targetId: string;
  targetName: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const [grants, setGrants] = useState<Grant[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState<"VIEW" | "EDIT">("VIEW");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const g = await fetch(`/api/permissions?targetType=${targetType}&targetId=${targetId}`).then((r) => r.json());
    setGrants(g);
    if (targetType === "file") {
      const l = await fetch(`/api/share?fileId=${targetId}`).then((r) => r.json());
      setLinks(l);
    }
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hedef değiştiğinde izin/link listesi yeniden çekilir
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId]);

  async function grantAccess(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await fetch("/api/permissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetType, targetId, userEmail: email, permission }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Paylaşılamadı");
      return;
    }
    toast(`${email} ile paylaşıldı`, "success");
    setEmail("");
    load();
  }

  async function revokeAccess(userId: string) {
    await fetch("/api/permissions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetType, targetId, userId }),
    });
    toast("Erişim kaldırıldı");
    load();
  }

  async function createLink() {
    setBusy(true);
    await fetch("/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileId: targetId }),
    });
    setBusy(false);
    toast("Genel bağlantı oluşturuldu", "success");
    load();
  }

  async function revokeLink(id: string) {
    await fetch(`/api/share/revoke/${id}`, { method: "POST" });
    toast("Bağlantı iptal edildi");
    load();
  }

  function copyLink(token: string) {
    const url = `${window.location.origin}/api/share/${token}`;
    navigator.clipboard
      .writeText(url)
      .then(() => toast("Bağlantı kopyalandı", "success"))
      .catch(() => toast("Kopyalanamadı", "error"));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div
        className="w-full max-w-lg rounded-2xl border p-6 shadow-lg"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
              Paylaş
            </h2>
            <p className="max-w-xs truncate text-sm" style={{ color: "var(--text-secondary)" }}>
              {targetName}
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost">
            Kapat
          </button>
        </div>

        <form onSubmit={grantAccess} className="mb-4 flex gap-2">
          <input
            required
            type="email"
            placeholder="kullanici@sirket.com"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <select
            className="input w-28"
            value={permission}
            onChange={(e) => setPermission(e.target.value as "VIEW" | "EDIT")}
          >
            <option value="VIEW">Görüntüle</option>
            <option value="EDIT">Düzenle</option>
          </select>
          <button disabled={busy} className="btn-primary shrink-0">
            Ekle
          </button>
        </form>
        {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

        {loading ? (
          <div className="mb-5 space-y-2">
            <div className="skeleton h-10 w-full" />
            <div className="skeleton h-10 w-full" />
          </div>
        ) : (
          <div className="mb-5 space-y-2">
            {grants.length === 0 && (
              <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                Henüz kimseyle paylaşılmadı.
              </p>
            )}
            {grants.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: "var(--border)" }}
              >
                <div>
                  <div className="font-medium" style={{ color: "var(--text-primary)" }}>
                    {g.user.name}
                  </div>
                  <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    {g.user.email}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="rounded px-2 py-0.5 text-xs"
                    style={{ background: "var(--surface-muted)", color: "var(--text-primary)" }}
                  >
                    {g.permission === "EDIT" ? "Düzenle" : "Görüntüle"}
                  </span>
                  <button className="btn-ghost text-red-600 dark:text-red-400" onClick={() => revokeAccess(g.user.id)}>
                    Kaldır
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {targetType === "file" && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                Genel bağlantılar
              </h3>
              <button className="btn-secondary text-xs" disabled={busy} onClick={createLink}>
                + Yeni bağlantı
              </button>
            </div>
            <div className="space-y-2">
              {!loading && links.filter((l) => !l.revoked).length === 0 && (
                <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                  Aktif bağlantı yok.
                </p>
              )}
              {links
                .filter((l) => !l.revoked)
                .map((l) => (
                  <div
                    key={l.id}
                    className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <div className="truncate" style={{ color: "var(--text-secondary)" }}>
                      …/{l.token.slice(0, 16)}…
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                        {l.downloadCount} indirme
                      </span>
                      <button className="btn-ghost" onClick={() => copyLink(l.token)}>
                        Kopyala
                      </button>
                      <button className="btn-ghost text-red-600 dark:text-red-400" onClick={() => revokeLink(l.id)}>
                        İptal
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
