"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function SetupPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/setup")
      .then((r) => r.json())
      .then((d) => {
        if (!d.needsSetup) router.replace("/login");
        else setChecking(false);
      });
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    setLoading(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Kurulum başarısız oldu");
      return;
    }
    router.push("/drive");
  }

  if (checking) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-lg font-semibold text-white">
            C
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Cdrive&apos;ı kur</h1>
          <p className="mt-1 text-sm text-slate-500">
            Sistemde henüz kullanıcı yok. İlk yönetici hesabını oluştur.
          </p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Ad Soyad">
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              placeholder="Ada Lovelace"
            />
          </Field>
          <Field label="E-posta">
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="ad@sirket.com"
            />
          </Field>
          <Field label="Şifre">
            <input
              required
              minLength={8}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              placeholder="En az 8 karakter"
            />
          </Field>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button disabled={loading} className="btn-primary w-full">
            {loading ? "Oluşturuluyor…" : "Yönetici hesabı oluştur"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}
