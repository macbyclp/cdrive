"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { withBasePath } from "@/lib/basePath";
import Footer from "@/components/Footer";

function LoginForm() {
  const t = useTranslations("auth.login");
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [needsTwoFactor, setNeedsTwoFactor] = useState(false);
  const [useRecovery, setUseRecovery] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch(withBasePath("/api/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, remember }),
    });
    const d = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(d.error ?? t("errorLogin"));
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
      setError(d.error ?? t("errorVerify"));
      return;
    }
    router.push(params.get("next") ?? "/drive");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-md rounded-[1.75rem] border p-8 shadow-sm" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="mb-6 text-center">
          <div
            className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl text-lg font-bold brand-mark"
          >
            C
          </div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            {needsTwoFactor ? t("titleTwoFactor") : t("title")}
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            {needsTwoFactor ? t("subtitleTwoFactor") : t("subtitle")}
          </p>
        </div>

        {!needsTwoFactor ? (
          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                {t("emailLabel")}
              </span>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder={t("emailPlaceholder")}
              />
            </label>
            <label className="block">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {t("passwordLabel")}
                </span>
                <a href={withBasePath("/forgot-password")} className="text-xs" style={{ color: "var(--accent)" }}>
                  {t("forgotPassword")}
                </a>
              </div>
              <input
                required
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
              />
            </label>
            <label className="flex cursor-pointer items-center gap-2 select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-4 w-4 cursor-pointer accent-[var(--accent)]"
              />
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {t("rememberMe")}
              </span>
            </label>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <button disabled={loading} className="btn-primary w-full">
              {loading ? t("submitting") : t("submit")}
            </button>
            <p className="text-center text-xs" style={{ color: "var(--text-tertiary)" }}>
              {remember ? t("rememberHintOn") : t("rememberHintOff")}
            </p>
          </form>
        ) : (
          <form onSubmit={submitCode} className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                {t("twoFactorLabel")}
              </span>
              <input
                required
                autoFocus
                inputMode={useRecovery ? "text" : "numeric"}
                autoComplete="one-time-code"
                maxLength={useRecovery ? 16 : 6}
                value={code}
                onChange={(e) => setCode(useRecovery ? e.target.value : e.target.value.replace(/\D/g, ""))}
                className="input text-center text-lg tracking-[0.3em]"
                placeholder={useRecovery ? "xxxxx-xxxxx" : "000000"}
              />
            </label>
            <button
              type="button"
              className="block w-full text-center text-xs"
              style={{ color: "var(--accent)" }}
              onClick={() => {
                setUseRecovery((v) => !v);
                setCode("");
                setError(null);
              }}
            >
              {useRecovery ? t("useAuthenticator") : t("useRecoveryCode")}
            </button>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <button disabled={loading || code.length < (useRecovery ? 10 : 6)} className="btn-primary w-full">
              {loading ? t("twoFactorSubmitting") : t("twoFactorSubmit")}
            </button>
            <button
              type="button"
              className="btn-ghost w-full"
              onClick={() => {
                setNeedsTwoFactor(false);
                setUseRecovery(false);
                setCode("");
                setError(null);
              }}
            >
              {t("back")}
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
