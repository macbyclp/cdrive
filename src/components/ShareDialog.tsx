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
  hasPassword: boolean;
};

const EXPIRY_OPTIONS = [
  { label: "Süresiz", hours: undefined },
  { label: "1 gün", hours: 24 },
  { label: "7 gün", hours: 24 * 7 },
  { label: "30 gün", hours: 24 * 30 },
] as const;

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

  // Bağlantı oluşturma paneli
  const [creatingLink, setCreatingLink] = useState(false);
  const [expiryIdx, setExpiryIdx] = useState(0);
  const [limitEnabled, setLimitEnabled] = useState(false);
  const [maxDownloads, setMaxDownloads] = useState(10);
  const [passwordEnabled, setPasswordEnabled] = useState(false);
  const [linkPassword, setLinkPassword] = useState("");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

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
    if (passwordEnabled && linkPassword.trim().length < 4) {
      toast("Şifre en az 4 karakter olmalı", "error");
      return;
    }
    setBusy(true);
    const expiresInHours = EXPIRY_OPTIONS[expiryIdx].hours;
    await fetch("/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileId: targetId,
        ...(expiresInHours ? { expiresInHours } : {}),
        ...(limitEnabled ? { maxDownloads } : {}),
        ...(passwordEnabled ? { password: linkPassword } : {}),
      }),
    });
    setBusy(false);
    setCreatingLink(false);
    setExpiryIdx(0);
    setLimitEnabled(false);
    setPasswordEnabled(false);
    setLinkPassword("");
    toast("Bağlantı oluşturuldu", "success");
    load();
  }

  async function revokeLink(id: string) {
    await fetch(`/api/share/revoke/${id}`, { method: "POST" });
    toast("Bağlantı iptal edildi");
    load();
  }

  function copyLink(token: string) {
    const url = `${window.location.origin}/s/${token}`;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopiedToken(token);
        toast("Bağlantı kopyalandı", "success");
        setTimeout(() => setCopiedToken((t) => (t === token ? null : t)), 2000);
      })
      .catch(() => toast("Kopyalanamadı", "error"));
  }

  return (
    <div className="dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div
        className="dialog-panel w-full max-w-lg rounded-2xl border p-6"
        style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-lg)" }}
      >
        <div className="mb-5 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg"
              style={{ background: "var(--accent-soft)" }}
            >
              🔗
            </div>
            <div>
              <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
                Paylaş
              </h2>
              <p className="max-w-[16rem] truncate text-sm" style={{ color: "var(--text-secondary)" }}>
                {targetName}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost">
            Kapat
          </button>
        </div>

        <form onSubmit={grantAccess} className="mb-2 flex gap-2">
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
          <div className="mb-6 mt-3 space-y-2">
            <div className="skeleton h-10 w-full" />
            <div className="skeleton h-10 w-full" />
          </div>
        ) : (
          <div className="mb-6 mt-3 space-y-2">
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
                  <span className="badge">{g.permission === "EDIT" ? "Düzenle" : "Görüntüle"}</span>
                  <button className="btn-ghost text-red-600 dark:text-red-400" onClick={() => revokeAccess(g.user.id)}>
                    Kaldır
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {targetType === "file" && (
          <div className="border-t pt-4" style={{ borderColor: "var(--border)" }}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                Genel bağlantılar
              </h3>
              {!creatingLink && (
                <button className="btn-secondary text-xs" onClick={() => setCreatingLink(true)}>
                  + Yeni bağlantı
                </button>
              )}
            </div>

            {creatingLink && (
              <div
                className="mb-4 space-y-3 rounded-xl border p-4"
                style={{ borderColor: "var(--accent)", background: "var(--accent-soft)" }}
              >
                <div>
                  <span className="mb-1.5 block text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                    Son kullanma
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {EXPIRY_OPTIONS.map((opt, i) => (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() => setExpiryIdx(i)}
                        className="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
                        style={
                          expiryIdx === i
                            ? { background: "var(--accent)", color: "var(--accent-foreground)", borderColor: "var(--accent)" }
                            : { background: "var(--surface)", color: "var(--text-secondary)", borderColor: "var(--border)" }
                        }
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="flex items-center gap-2 text-xs" style={{ color: "var(--text-primary)" }}>
                  <input
                    type="checkbox"
                    checked={limitEnabled}
                    onChange={(e) => setLimitEnabled(e.target.checked)}
                    className="h-3.5 w-3.5"
                  />
                  İndirme sayısını sınırla
                  {limitEnabled && (
                    <input
                      type="number"
                      min={1}
                      value={maxDownloads}
                      onChange={(e) => setMaxDownloads(Number(e.target.value))}
                      className="input w-16 px-2 py-1 text-xs"
                    />
                  )}
                </label>

                <label className="flex items-center gap-2 text-xs" style={{ color: "var(--text-primary)" }}>
                  <input
                    type="checkbox"
                    checked={passwordEnabled}
                    onChange={(e) => setPasswordEnabled(e.target.checked)}
                    className="h-3.5 w-3.5"
                  />
                  Şifreyle koru
                  {passwordEnabled && (
                    <input
                      type="text"
                      minLength={4}
                      placeholder="şifre"
                      value={linkPassword}
                      onChange={(e) => setLinkPassword(e.target.value)}
                      className="input w-28 px-2 py-1 text-xs"
                    />
                  )}
                </label>

                <div className="flex justify-end gap-2 pt-1">
                  <button type="button" className="btn-ghost text-xs" onClick={() => setCreatingLink(false)}>
                    Vazgeç
                  </button>
                  <button type="button" disabled={busy} className="btn-primary text-xs" onClick={createLink}>
                    Bağlantı oluştur
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {!loading && links.filter((l) => !l.revoked).length === 0 && !creatingLink && (
                <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                  Aktif bağlantı yok.
                </p>
              )}
              {links
                .filter((l) => !l.revoked)
                .map((l) => {
                  const url = `${typeof window !== "undefined" ? window.location.origin : ""}/s/${l.token}`;
                  const copied = copiedToken === l.token;
                  return (
                    <div
                      key={l.id}
                      className="link-card overflow-hidden rounded-xl border"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <div className="flex items-center gap-2 px-3 pt-3">
                        <span className="text-base">🔗</span>
                        <code
                          className="min-w-0 flex-1 truncate text-xs"
                          style={{ color: "var(--text-secondary)" }}
                          title={url}
                        >
                          {url.replace(/^https?:\/\//, "")}
                        </code>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2 pt-2">
                        <span className="badge">{l.downloadCount} indirme</span>
                        {l.hasPassword && <span className="badge">🔒 şifreli</span>}
                        {l.maxDownloads && <span className="badge">limit: {l.maxDownloads}</span>}
                        {l.expiresAt ? (
                          <span className="badge">↳ {new Date(l.expiresAt).toLocaleDateString("tr-TR")}</span>
                        ) : (
                          <span className="badge">süresiz</span>
                        )}
                      </div>
                      <div className="flex border-t" style={{ borderColor: "var(--border)" }}>
                        <button
                          onClick={() => copyLink(l.token)}
                          className="flex-1 border-r px-3 py-2 text-xs font-medium transition-colors"
                          style={{
                            borderColor: "var(--border)",
                            color: copied ? "var(--success)" : "var(--accent)",
                          }}
                        >
                          {copied ? "✓ Kopyalandı" : "Bağlantıyı kopyala"}
                        </button>
                        <button
                          onClick={() => revokeLink(l.id)}
                          className="px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400"
                        >
                          İptal et
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
