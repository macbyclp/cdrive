"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ToastProvider";
import { withBasePath } from "@/lib/basePath";
import { formatBytesStr } from "@/lib/format";

type Row = {
  id: string;
  token: string;
  title: string;
  expiresAt: string;
  maxFiles: number;
  maxFileBytes: string;
  uploadCount: number;
  hasPassword: boolean;
  status: "active" | "expired" | "full" | "revoked";
};

const EXPIRY_DAYS = [1, 7, 14, 30] as const;
const STATUS_LABEL: Record<Row["status"], string> = { active: "Açık", expired: "Süresi doldu", full: "Doldu", revoked: "İptal" };

/** Bir klasör için "dosya isteği": hesabı olmayan birinin yalnızca bu klasöre dosya yükleyebildiği bağlantı. */
export default function UploadRequestDialog({ folderId, folderName, onClose }: { folderId: string; folderName: string; onClose: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(`Dosya isteği: ${folderName}`.slice(0, 100));
  const [message, setMessage] = useState("");
  const [days, setDays] = useState<number>(7);
  const [maxFiles, setMaxFiles] = useState(20);
  const [maxFileMB, setMaxFileMB] = useState(50);
  const [password, setPassword] = useState("");
  const [newUrl, setNewUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(withBasePath(`/api/upload-requests?folderId=${encodeURIComponent(folderId)}`));
    if (res.ok) setRows(await res.json());
    setLoading(false);
  }, [folderId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- klasör değiştiğinde istek listesi yeniden çekilir
    void load();
  }, [load]);

  const urlFor = (token: string) => `${window.location.origin}${withBasePath(`/u/${token}`)}`;

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast("Bağlantı kopyalandı", "success");
    } catch {
      toast("Kopyalanamadı", "error");
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await fetch(withBasePath("/api/upload-requests"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        folderId,
        title,
        message: message || undefined,
        expiresInDays: days,
        maxFiles,
        maxFileMB,
        password: password || undefined,
      }),
    });
    setBusy(false);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(d.error ?? "Oluşturulamadı");
      return;
    }
    setNewUrl(urlFor(d.token));
    setPassword("");
    void load();
  }

  async function revoke(id: string) {
    const res = await fetch(withBasePath(`/api/upload-requests/${id}`), { method: "DELETE" });
    if (!res.ok) {
      toast("İptal edilemedi", "error");
      return;
    }
    toast("İstek iptal edildi");
    void load();
  }

  return (
    <div className="dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div
        className="dialog-panel max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border p-6"
        style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-lg)" }}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
              Dosya isteği
            </h2>
            <p className="max-w-[18rem] truncate text-sm" style={{ color: "var(--text-secondary)" }}>
              {folderName}
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost">
            Kapat
          </button>
        </div>

        <p className="mb-4 text-sm" style={{ color: "var(--text-secondary)" }}>
          Hesabı olmayan biri bu bağlantıyla yalnızca <strong>dosya yükleyebilir</strong>; klasörü göremez, hiçbir şey indiremez.
          Yüklenen dosyalar senin kotana yazılır.
        </p>

        {newUrl && (
          <div className="mb-4 rounded-xl border p-3" style={{ borderColor: "var(--accent)", background: "var(--accent-soft)" }}>
            <p className="mb-2 text-xs font-medium" style={{ color: "var(--text-primary)" }}>
              Bağlantı hazır — paylaşabilirsin:
            </p>
            <div className="flex gap-2">
              <input readOnly className="input text-xs" value={newUrl} onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className="btn-primary shrink-0" onClick={() => copy(newUrl)}>
                Kopyala
              </button>
            </div>
          </div>
        )}

        <form onSubmit={create} className="space-y-3">
          <input required maxLength={100} className="input" placeholder="Başlık" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea
            maxLength={500}
            rows={2}
            className="input"
            placeholder="Yükleyene mesaj (isteğe bağlı) — ör. hangi belgeleri beklediğin"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-medium" style={{ color: "var(--text-primary)" }}>
              Geçerlilik
            </span>
            {EXPIRY_DAYS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className="rounded-full border px-3 py-1 text-xs font-medium"
                style={
                  days === d
                    ? { background: "var(--accent)", color: "var(--accent-foreground)", borderColor: "var(--accent)" }
                    : { background: "var(--surface)", color: "var(--text-secondary)", borderColor: "var(--border)" }
                }
              >
                {d} gün
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
              En çok dosya
              <input type="number" min={1} max={200} className="input mt-1" value={maxFiles} onChange={(e) => setMaxFiles(Math.max(1, Number(e.target.value) || 1))} />
            </label>
            <label className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
              Dosya başı en çok (MB)
              <input type="number" min={1} max={2048} className="input mt-1" value={maxFileMB} onChange={(e) => setMaxFileMB(Math.max(1, Number(e.target.value) || 1))} />
            </label>
          </div>
          <input
            type="password"
            autoComplete="new-password"
            minLength={4}
            className="input"
            placeholder="Şifre (isteğe bağlı)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <button disabled={busy} className="btn-primary w-full">
            {busy ? "Oluşturuluyor…" : "Bağlantı oluştur"}
          </button>
        </form>

        <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--border)" }}>
          <h3 className="mb-2 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Bu klasörün istekleri
          </h3>
          {loading ? (
            <div className="skeleton h-10 w-full" />
          ) : rows.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
              Henüz istek yok.
            </p>
          ) : (
            <ul className="space-y-2">
              {rows.map((r) => (
                <li key={r.id} className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium" style={{ color: "var(--text-primary)" }}>
                      {r.title}
                    </span>
                    <span className="badge shrink-0">{STATUS_LABEL[r.status]}</span>
                  </div>
                  <div className="mt-0.5 text-xs" style={{ color: "var(--text-secondary)" }}>
                    {r.uploadCount}/{r.maxFiles} dosya · en çok {formatBytesStr(r.maxFileBytes)} · {new Date(r.expiresAt).toLocaleDateString("tr-TR")} tarihine kadar
                    {r.hasPassword ? " · şifreli" : ""}
                  </div>
                  {r.status === "active" && (
                    <div className="mt-1.5 flex gap-2">
                      <button className="btn-secondary text-xs" onClick={() => copy(urlFor(r.token))}>
                        Bağlantıyı kopyala
                      </button>
                      <button className="btn-ghost text-xs text-red-600 dark:text-red-400" onClick={() => revoke(r.id)}>
                        İptal et
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
