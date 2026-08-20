"use client";

import { useState } from "react";
import { withBasePath } from "@/lib/basePath";
import Footer from "@/components/Footer";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch(withBasePath("/api/auth/forgot-password"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setLoading(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Bir şeyler ters gitti");
      return;
    }
    setSent(true);
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
              Şifremi unuttum
            </h1>
            <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
              E-posta adresini gir, sana bir sıfırlama bağlantısı gönderelim.
            </p>
          </div>

          {sent ? (
            <div className="space-y-4 text-center">
              <p className="text-sm" style={{ color: "var(--text-primary)" }}>
                Bu e-posta adresine kayıtlı bir hesap varsa, birkaç dakika içinde bir şifre
                sıfırlama bağlantısı alacaksın. Bağlantı 1 saat geçerli.
              </p>
              <a href={withBasePath("/login")} className="btn-secondary inline-block">
                Girişe dön
              </a>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <label className="block">
                <span className="mb-1 block text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  E-posta
                </span>
                <input
                  required
                  autoFocus
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                  placeholder="ad@sirket.com"
                />
              </label>
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
              <button disabled={loading} className="btn-primary w-full">
                {loading ? "Gönderiliyor…" : "Sıfırlama bağlantısı gönder"}
              </button>
              <a href={withBasePath("/login")} className="block text-center text-sm" style={{ color: "var(--text-secondary)" }}>
                Girişe dön
              </a>
            </form>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
