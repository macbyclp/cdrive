import { withBasePath } from "@/lib/basePath";

/** Hata sınırlarından çağrılır; bildirim başarısız olursa sessizce yutulur. */
export function reportClientError(error: Error & { digest?: string }) {
  try {
    void fetch(withBasePath("/api/client-error"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        digest: error.digest,
        stack: error.stack,
        path: typeof window !== "undefined" ? window.location.pathname : undefined,
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* yoksay */
  }
}
