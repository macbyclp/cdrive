"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMe } from "@/lib/useMe";
import { withBasePath } from "@/lib/basePath";
import { AVATAR_PRESETS } from "@/lib/avatars";

/** İlk giriş kurulumu — admin tarafından açılan hesaplar buradan geçmeden başka hiçbir yere giremez. */
export default function OnboardingPage() {
  const router = useRouter();
  const { user, refresh } = useMe();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [avatarKey, setAvatarKey] = useState(AVATAR_PRESETS[0].key);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Şifre en az 8 karakter olmalı");
      return;
    }
    if (password !== confirm) {
      setError("Şifreler eşleşmiyor");
      return;
    }
    setBusy(true);
    const res = await fetch(withBasePath("/api/account/onboarding"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, avatarKey }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Kurulum tamamlanamadı");
      return;
    }
    router.push("/drive");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ background: "var(--background)" }}>
      <div
        className="w-full max-w-lg rounded-2xl border p-8"
        style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-lg)" }}
      >
        <div
          className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl text-lg font-bold text-white"
          style={{ background: "linear-gradient(135deg, var(--accent), #a78bfa)" }}
        >
          C
        </div>
        <h1 className="text-center text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
          Hoş geldin{user ? `, ${user.name}` : ""}
        </h1>
        <p className="mx-auto mt-1 max-w-sm text-center text-sm" style={{ color: "var(--text-secondary)" }}>
          Hesabın bir yönetici tarafından açıldı. Devam etmeden önce kendi şifreni belirle ve bir avatar seç.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                Yeni şifre
              </span>
              <input
                required
                type="password"
                minLength={8}
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                Şifre (tekrar)
              </span>
              <input
                required
                type="password"
                minLength={8}
                className="input"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
          </div>

          <div>
            <span className="mb-2 block text-xs font-medium" style={{ color: "var(--text-primary)" }}>
              Avatarını seç
            </span>
            <div className="grid grid-cols-8 gap-2 sm:grid-cols-8">
              {AVATAR_PRESETS.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => setAvatarKey(a.key)}
                  className="flex aspect-square items-center justify-center rounded-full text-lg transition-transform"
                  style={{
                    background: `linear-gradient(135deg, ${a.from}, ${a.to})`,
                    outline: avatarKey === a.key ? "3px solid var(--accent)" : "none",
                    outlineOffset: "2px",
                    transform: avatarKey === a.key ? "scale(1.08)" : "none",
                  }}
                  aria-label={a.key}
                >
                  {a.emoji}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <button disabled={busy} className="btn-primary w-full">
            {busy ? "Kaydediliyor…" : "Kurulumu tamamla"}
          </button>
        </form>
      </div>
    </div>
  );
}
