import type { Instrumentation } from "next";

// Sunucu tarafında yakalanan tüm istek hatalarını bildirir (bkz. lib/error-report.ts).
export const onRequestError: Instrumentation.onRequestError = async (err, request) => {
  const { reportError } = await import("@/lib/error-report");
  const e = err as { message?: string; digest?: string; stack?: string };
  await reportError({
    source: "server",
    message: e?.message ?? String(err),
    digest: e?.digest,
    stack: e?.stack,
    path: request.path,
    method: request.method,
  });
};
