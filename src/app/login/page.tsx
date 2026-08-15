"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setLoading(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Giriş başarısız");
      return;
    }
    router.push(params.get("next") ?? "/drive");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ background: "var(--background)" }}>
      <div className="w-full max-w-md rounded-2xl border p-8 shadow-sm" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-lg font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
            C
          </div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Cdrive&apos;a giriş yap
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            Kurumsal dosya yönetim platformu
          </p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              E-posta
            </span>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="ad@sirket.com"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              Şifre
            </span>
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
            />
          </label>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <button disabled={loading} className="btn-primary w-full">
            {loading ? "Giriş yapılıyor…" : "Giriş yap"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
