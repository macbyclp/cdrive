"use client";

import { useEffect, useState } from "react";
import TopBar from "@/components/TopBar";
import AvatarBuilder from "@/components/AvatarBuilder";
import { useToast } from "@/components/ToastProvider";
import { useMe } from "@/lib/useMe";
import type { MeUser } from "@/lib/types";
import { withBasePath } from "@/lib/basePath";
import { DEFAULT_AVATAR_CONFIG, parseAvatarConfig, type AvatarConfig } from "@/lib/avatar-parts";

export default function AccountPage() {
  const { user, refresh } = useMe();

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!user) return null;

  return (
    <div className="min-h-screen">
      <TopBar user={user} />
      <main className="mx-auto max-w-2xl p-4 sm:p-6">
        <h1 className="mb-1 text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
          Hesap ayarları
        </h1>
        <p className="mb-6 text-sm" style={{ color: "var(--text-secondary)" }}>
          {user.name} · {user.email}
        </p>

        <div className="space-y-6">
          <AvatarCard user={user} onChange={refresh} />
          <PasswordCard />
          <TwoFactorCard user={user} onChange={refresh} />
          <SessionsCard />
        </div>
      </main>
    </div>
  );
}

function AvatarCard({ user, onChange }: { user: MeUser; onChange: () => void }) {
  const toast = useToast();
  const [config, setConfig] = useState<AvatarConfig>(() => parseAvatarConfig(user.avatarParts) ?? DEFAULT_AVATAR_CONFIG);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const res = await fetch(withBasePath("/api/account/avatar"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast(d.error ?? "Avatar kaydedilemedi", "error");
      return;
    }
    toast("Avatar güncellendi", "success");
    onChange();
  }

  return (
    <div className="card p-5">
      <h2 className="mb-1 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        Avatarım
      </h2>
      <p className="mb-4 text-sm" style={{ color: "var(--text-secondary)" }}>
        Avatarını istediğin zaman değiştirebilirsin.
      </p>
      <AvatarBuilder value={config} onChange={setConfig} />
      <button disabled={busy} onClick={save} className="btn-primary mt-4 w-full">
        {busy ? "Kaydediliyor…" : "Avatarı kaydet"}
      </button>
    </div>
  );
}

function PasswordCard() {
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await fetch(withBasePath("/api/account/password"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Şifre değiştirilemedi");
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    toast("Şifre güncellendi", "success");
  }

  return (
    <div className="card p-5">
      <h2 className="mb-1 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        Şifre değiştir
      </h2>
      <p className="mb-4 text-sm" style={{ color: "var(--text-secondary)" }}>
        Şifreni değiştirmek için mevcut şifreni doğrula.
      </p>
      <form onSubmit={submit} className="space-y-3">
        <input
          required
          type="password"
          placeholder="Mevcut şifre"
          className="input"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
        <input
          required
          minLength={8}
          type="password"
          placeholder="Yeni şifre (en az 8 karakter)"
          className="input"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button disabled={busy} className="btn-primary">
          Şifreyi güncelle
        </button>
      </form>
    </div>
  );
}

function TwoFactorCard({ user, onChange }: { user: MeUser; onChange: () => void }) {
  const toast = useToast();
  const [setupData, setSetupData] = useState<{ secret: string; qrCode: string } | null>(null);
  const [code, setCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [showDisable, setShowDisable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function startSetup() {
    setError(null);
    setBusy(true);
    const res = await fetch(withBasePath("/api/account/2fa/setup"), { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Başlatılamadı");
      return;
    }
    setSetupData(await res.json());
  }

  async function confirmEnable(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await fetch(withBasePath("/api/account/2fa/enable"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Doğrulanamadı");
      return;
    }
    setSetupData(null);
    setCode("");
    toast("İki adımlı doğrulama açıldı", "success");
    onChange();
  }

  async function disable(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await fetch(withBasePath("/api/account/2fa/disable"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: disablePassword }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Kapatılamadı");
      return;
    }
    setShowDisable(false);
    setDisablePassword("");
    toast("İki adımlı doğrulama kapatıldı");
    onChange();
  }

  return (
    <div className="card p-5">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          İki adımlı doğrulama (2FA)
        </h2>
        <span className="badge">{user.twoFactorEnabled ? "Açık" : "Kapalı"}</span>
      </div>
      <p className="mb-4 text-sm" style={{ color: "var(--text-secondary)" }}>
        Google Authenticator, Authy gibi bir uygulamayla girişte ek bir kod istenir.
      </p>

      {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {!user.twoFactorEnabled && !setupData && (
        <button disabled={busy} className="btn-primary" onClick={startSetup}>
          2FA&apos;yı etkinleştir
        </button>
      )}

      {setupData && (
        <form onSubmit={confirmEnable} className="space-y-3">
          <div className="flex flex-col items-center gap-2 rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={setupData.qrCode} alt="2FA QR kodu" className="h-40 w-40" />
            <code className="text-xs" style={{ color: "var(--text-secondary)" }}>
              {setupData.secret}
            </code>
          </div>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            QR kodu authenticator uygulamanla tara, sonra uygulamanın gösterdiği 6 haneli kodu gir.
          </p>
          <input
            required
            autoFocus
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            className="input text-center tracking-[0.5em]"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={() => setSetupData(null)}>
              Vazgeç
            </button>
            <button disabled={busy || code.length !== 6} className="btn-primary">
              Onayla ve aç
            </button>
          </div>
        </form>
      )}

      {user.twoFactorEnabled && !showDisable && (
        <button className="btn-secondary text-red-600 dark:text-red-400" onClick={() => setShowDisable(true)}>
          2FA&apos;yı kapat
        </button>
      )}
      {showDisable && (
        <form onSubmit={disable} className="space-y-3">
          <input
            required
            type="password"
            placeholder="Şifreni doğrula"
            className="input"
            value={disablePassword}
            onChange={(e) => setDisablePassword(e.target.value)}
          />
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={() => setShowDisable(false)}>
              Vazgeç
            </button>
            <button disabled={busy} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-400">
              2FA&apos;yı kapat
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

type SessionItem = {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
};

function describeDevice(userAgent: string | null) {
  if (!userAgent) return "Bilinmeyen cihaz";
  if (/mobile/i.test(userAgent)) return "Mobil tarayıcı";
  if (/Windows/i.test(userAgent)) return "Windows · tarayıcı";
  if (/Macintosh/i.test(userAgent)) return "Mac · tarayıcı";
  if (/Linux/i.test(userAgent)) return "Linux · tarayıcı";
  return "Tarayıcı";
}

function SessionsCard() {
  const toast = useToast();
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function load() {
    fetch(withBasePath("/api/account/sessions"))
      .then((r) => r.json())
      .then((d) => {
        setSessions(d.sessions ?? []);
        setCurrentId(d.currentSessionId ?? null);
        setLoading(false);
      });
  }

  useEffect(() => {
    load();
  }, []);

  async function revoke(sessionId: string) {
    await fetch(withBasePath("/api/account/sessions/revoke"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
    toast("Oturum sonlandırıldı");
    load();
  }

  async function revokeOthers() {
    await fetch(withBasePath("/api/account/sessions/revoke-others"), { method: "POST" });
    toast("Diğer tüm oturumlar sonlandırıldı", "success");
    load();
  }

  return (
    <div className="card p-5">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          Aktif oturumlar
        </h2>
        {sessions.length > 1 && (
          <button className="btn-ghost text-xs text-red-600 dark:text-red-400" onClick={revokeOthers}>
            Diğerlerini kapat
          </button>
        )}
      </div>
      <p className="mb-4 text-sm" style={{ color: "var(--text-secondary)" }}>
        Cdrive&apos;a giriş yapmış olduğun cihazlar. Tanımadığın bir oturum görürsen sonlandır ve şifreni değiştir.
      </p>

      {loading && (
        <div className="space-y-2">
          <div className="skeleton h-12 w-full" />
          <div className="skeleton h-12 w-full" />
        </div>
      )}

      {!loading && (
        <div className="space-y-2">
          {sessions.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: "var(--border)" }}
            >
              <div>
                <div className="flex items-center gap-1.5 font-medium" style={{ color: "var(--text-primary)" }}>
                  {describeDevice(s.userAgent)}
                  {s.id === currentId && <span className="badge">bu cihaz</span>}
                </div>
                <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  {s.ip ?? "bilinmeyen IP"} · son görülme {new Date(s.lastSeenAt).toLocaleString("tr-TR")}
                </div>
              </div>
              {s.id !== currentId && (
                <button className="btn-ghost text-red-600 dark:text-red-400" onClick={() => revoke(s.id)}>
                  Sonlandır
                </button>
              )}
            </div>
          ))}
          {sessions.length === 0 && (
            <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
              Aktif oturum bulunamadı.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
