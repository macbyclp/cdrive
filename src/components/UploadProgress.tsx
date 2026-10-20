"use client";

import { useTranslations } from "next-intl";
import { formatBytesStr } from "@/lib/format";

export type UploadItem = {
  id: number;
  name: string;
  size: number;
  loaded: number;
  /** sending: bayt gönderiliyor · processing: gönderildi, sunucu işliyor · done · error */
  status: "sending" | "processing" | "done" | "error";
  error?: string;
  abort?: () => void;
};

/** Sağ altta yüzen yükleme paneli: genel ilerleme + dosya başına çubuk. Bitince kullanıcı kapatır (hatalar okunabilsin). */
export default function UploadProgress({ items, onClose }: { items: UploadItem[]; onClose: () => void }) {
  const t = useTranslations("drive.uploadProgress");
  if (items.length === 0) return null;

  const total = items.reduce((s, i) => s + i.size, 0);
  // Boyutu bilinmeyen işler (ZIP hazırlama/çıkarma) yalnız "işleniyor" gösterir.
  const determinate = total > 0;
  const loaded = items.reduce((s, i) => s + (i.status === "done" || i.status === "processing" ? i.size : Math.min(i.loaded, i.size)), 0);
  const pct = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
  const active = items.some((i) => i.status === "sending" || i.status === "processing");
  const doneCount = items.filter((i) => i.status === "done").length;
  const errorCount = items.filter((i) => i.status === "error").length;
  // Çok dosyada yalnızca etkin + son birkaç dosyayı göster (panel ekranı kaplamasın).
  const visible = items.filter((i) => i.status === "sending" || i.status === "processing" || i.status === "error").concat(items.filter((i) => i.status === "done").slice(-2)).slice(0, 6);

  return (
    <div
      role="status"
      aria-live="polite"
      className="glass-strong fixed bottom-4 right-4 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border p-3 shadow-lg"
      style={{ borderColor: "var(--border)" }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {active ? t("uploading", { done: doneCount, total: items.length }) : errorCount > 0 ? t("finishedWithErrors", { ok: doneCount, failed: errorCount }) : t("finished", { count: doneCount })}
        </span>
        {!active && (
          <button className="btn-ghost !px-2 !py-0.5 text-xs" onClick={onClose} aria-label={t("close")}>
            ✕
          </button>
        )}
      </div>

      <div
        className="mb-2 h-2 w-full overflow-hidden rounded-full"
        style={{ background: "var(--surface-muted)" }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div
          className="h-2 rounded-full transition-[width] duration-200"
          style={{ width: `${pct}%`, background: errorCount > 0 && !active ? "var(--danger)" : "var(--accent)" }}
        />
      </div>
      {determinate && (
        <div className="mb-2 flex justify-between text-xs" style={{ color: "var(--text-secondary)" }}>
          <span>{pct}%</span>
          <span>
            {formatBytesStr(Math.round(loaded))} / {formatBytesStr(Math.round(total))}
          </span>
        </div>
      )}

      <ul className="space-y-1.5">
        {visible.map((i) => {
          const p = i.size > 0 ? Math.min(100, Math.round((i.loaded / i.size) * 100)) : 0;
          return (
            <li key={i.id} className="text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate" style={{ color: "var(--text-primary)" }} title={i.name}>
                  {i.name}
                </span>
                <span className="shrink-0" style={{ color: i.status === "error" ? "var(--danger)" : "var(--text-secondary)" }}>
                  {i.status === "done" && "✓"}
                  {i.status === "error" && (i.error ?? t("failed"))}
                  {i.status === "processing" && t("processing")}
                  {i.status === "sending" && `${p}%`}
                </span>
                {i.status === "sending" && i.abort && (
                  <button className="btn-ghost !px-1.5 !py-0 text-xs" onClick={i.abort} aria-label={t("cancel")}>
                    ✕
                  </button>
                )}
              </div>
              {(i.status === "sending" || i.status === "processing") && (
                <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full" style={{ background: "var(--surface-muted)" }}>
                  <div className={`h-1 rounded-full ${i.status === "processing" ? "animate-pulse" : ""}`} style={{ width: `${i.status === "processing" ? 100 : p}%`, background: "var(--accent)" }} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
