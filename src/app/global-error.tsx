"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/report-client-error";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError(error);
  }, [error]);
  return (
    <html lang="tr">
      <body style={{ fontFamily: "sans-serif", padding: 32, textAlign: "center" }}>
        <h2>Uygulama yüklenemedi</h2>
        <p>Beklenmeyen bir hata oluştu.</p>
        <button onClick={() => reset()} style={{ padding: "8px 16px", cursor: "pointer" }}>
          Tekrar dene
        </button>
      </body>
    </html>
  );
}
