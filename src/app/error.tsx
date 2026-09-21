"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/report-client-error";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError(error);
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ background: "var(--background)" }}>
      <div
        className="w-full max-w-sm rounded-2xl border p-8 text-center"
        style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-lg)" }}
      >
        <p className="mb-2 text-4xl">⚠️</p>
        <h1 className="mb-1 text-base font-semibold" style={{ color: "var(--text-primary)" }}>
          Bir şeyler ters gitti
        </h1>
        <p className="mb-2 text-sm" style={{ color: "var(--text-secondary)" }}>
          Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.
        </p>
        {error.digest && (
          <p className="mb-4 text-xs" style={{ color: "var(--text-tertiary)" }}>
            Hata kodu: {error.digest}
          </p>
        )}
        <button onClick={() => reset()} className="btn-primary mt-2 w-full">
          Tekrar dene
        </button>
      </div>
    </div>
  );
}
