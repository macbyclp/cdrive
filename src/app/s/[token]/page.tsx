"use client";

import { use, useEffect, useState } from "react";
import { formatBytesStr, iconForMime } from "@/lib/format";
import { withBasePath } from "@/lib/basePath";

type Info = { name: string; mimeType: string; size: string; requiresPassword: boolean };

export default function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(withBasePath(`/api/share/${token}/info`))
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Bağlantı bulunamadı");
        setInfo(d);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Bir hata oluştu"));
  }, [token]);

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setPasswordError(null);
    const res = await fetch(withBasePath(`/api/share/${token}/verify`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setPasswordError(d.error ?? "Şifre hatalı");
      return;
    }
    setUnlocked(true);
  }

  function download() {
    const url = info?.requiresPassword
      ? `/api/share/${token}?password=${encodeURIComponent(password)}`
      : `/api/share/${token}`;
    window.location.href = withBasePath(url);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ background: "var(--background)" }}>
      <div
        className="dialog-panel w-full max-w-sm rounded-2xl border p-8 text-center"
        style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-lg)" }}
      >
        <div
          className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl text-lg font-bold text-white"
          style={{ background: "linear-gradient(135deg, #4f46e5, #a78bfa)" }}
        >
          C
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        {!error && !info && <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Yükleniyor…</p>}

        {info && (
          <>
            <span
              className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-xl text-2xl"
              style={{ background: "var(--accent-soft)" }}
            >
              {iconForMime(info.mimeType)}
            </span>
            <h1 className="mb-1 break-words text-base font-semibold" style={{ color: "var(--text-primary)" }}>
              {info.name}
            </h1>
            <p className="mb-6 text-sm" style={{ color: "var(--text-secondary)" }}>
              {formatBytesStr(info.size)} · Cdrive üzerinden paylaşıldı
            </p>

            {info.requiresPassword && !unlocked ? (
              <form onSubmit={submitPassword} className="space-y-3 text-left">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                    Bu dosya şifreyle korunuyor
                  </span>
                  <input
                    autoFocus
                    type="password"
                    required
                    className="input"
                    placeholder="Şifre"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                {passwordError && <p className="text-sm text-red-600 dark:text-red-400">{passwordError}</p>}
                <button disabled={busy} className="btn-primary w-full">
                  {busy ? "Kontrol ediliyor…" : "Kilidi aç"}
                </button>
              </form>
            ) : (
              <button className="btn-primary w-full" onClick={download}>
                ⬇ İndir
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
