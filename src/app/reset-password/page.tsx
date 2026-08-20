"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { withBasePath } from "@/lib/basePath";
import Footer from "@/components/Footer";

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setLoading(true);
    const res = await fetch(withBasePath("/api/auth/reset-password"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    setLoading(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Şifre sıfırlanamadı");
      return;
    }
    setDone(true);
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
              Yeni şifre belirle
            </h1>
          </div>

          {!token ? (
            <p className="text-center text-sm" style={{ color: "var(--text-secondary)" }}>
              Geçersiz bağlantı. Lütfen{" "}
              <a href={withBasePath("/forgot-password")} style={{ color: "var(--accent)" }}>
                yeniden şifre sıfırlama isteği
              </a>{" "}
              gönderin.
            </p>
          ) : done ? (
            <div className="space-y-4 text-center">
              <p className="text-sm" style={{ color: "var(--text-primary)" }}>
                Şifren güncellendi. Güvenlik için tüm oturumların kapatıldı — yeni şifrenle
                tekrar giriş yapabilirsin.
              </p>
              <button className="btn-primary w-full" onClick={() => router.push("/login")}>
                Girişe dön
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <label className="block">
                <span className="mb-1 block text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  Yeni şifre
                </span>
                <input
                  required
                  autoFocus
                  type="password"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  Yeni şifre (tekrar)
                </span>
                <input
                  required
                  type="password"
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="input"
                />
              </label>
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
              <button disabled={loading} className="btn-primary w-full">
                {loading ? "Kaydediliyor…" : "Şifreyi güncelle"}
              </button>
            </form>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
