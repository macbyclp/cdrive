"use client";

import { useEffect, useState } from "react";
import TopBar from "@/components/TopBar";
import { useToast } from "@/components/ToastProvider";
import type { MeUser } from "@/lib/types";

export default function AccountPage() {
  const [user, setUser] = useState<MeUser | null>(null);

  function refresh() {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user));
  }

  useEffect(() => {
    refresh();
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
          <PasswordCard />
          <TwoFactorCard user={user} onChange={refresh} />
        </div>
      </main>
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
    const res = await fetch("/api/account/password", {
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
    const res = await fetch("/api/account/2fa/setup", { method: "POST" });
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
    const res = await fetch("/api/account/2fa/enable", {
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
    const res = await fetch("/api/account/2fa/disable", {
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
