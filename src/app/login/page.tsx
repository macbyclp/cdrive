"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { withBasePath } from "@/lib/basePath";
import Footer from "@/components/Footer";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [needsTwoFactor, setNeedsTwoFactor] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch(withBasePath("/api/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const d = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(d.error ?? "Giriş başarısız");
      return;
    }
    if (d.requiresTwoFactor) {
      setNeedsTwoFactor(true);
      return;
    }
    router.push(params.get("next") ?? "/drive");
    router.refresh();
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch(withBasePath("/api/auth/2fa/verify"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    setLoading(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Doğrulama başarısız");
      return;
    }
    router.push(params.get("next") ?? "/drive");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col" style={{ background: "var(--background)" }}>
      <div className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border p-8 shadow-sm" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="mb-6 text-center">
          <div
            className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl text-lg font-bold text-white"
            style={{ background: "linear-gradient(135deg, #4f46e5, #a78bfa)", boxShadow: "var(--shadow-md)" }}
          >
            C
          </div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            {needsTwoFactor ? "Doğrulama kodu" : "Cdrive'a giriş yap"}
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            {needsTwoFactor ? "Kimlik doğrulama uygulamanızdaki 6 haneli kodu girin" : "Kurumsal dosya yönetim platformu"}
          </p>
        </div>

        {!needsTwoFactor ? (
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
        ) : (
          <form onSubmit={submitCode} className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                Doğrulama kodu
              </span>
              <input
                required
                autoFocus
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="input text-center text-lg tracking-[0.5em]"
                placeholder="000000"
              />
            </label>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <button disabled={loading || code.length !== 6} className="btn-primary w-full">
              {loading ? "Doğrulanıyor…" : "Doğrula"}
            </button>
            <button
              type="button"
              className="btn-ghost w-full"
              onClick={() => {
                setNeedsTwoFactor(false);
                setCode("");
                setError(null);
              }}
            >
              Geri dön
            </button>
          </form>
        )}
      </div>
      </div>
      <Footer />
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
