"use client";

import { useEffect, useState } from "react";
import { formatBytesStr } from "@/lib/format";
import { withBasePath } from "@/lib/basePath";

type DiffPart = { added: boolean; removed: boolean; value: string };
type DiffResult =
  | { binary: true; sizeFrom: string; sizeTo: string; versionNoFrom: number; versionNoTo: number }
  | { binary: false; versionNoFrom: number; versionNoTo: number; parts: DiffPart[] };

export default function VersionDiffDialog({
  fileId,
  fileName,
  fromVersionId,
  toVersionId,
  onClose,
}: {
  fileId: string;
  fileName: string;
  fromVersionId: string;
  toVersionId: string;
  onClose: () => void;
}) {
  const [result, setResult] = useState<DiffResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(withBasePath(`/api/files/${fileId}/versions/${toVersionId}/diff?against=${fromVersionId}`))
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Fark hesaplanamadı");
        setResult(d);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Fark hesaplanamadı"));
  }, [fileId, fromVersionId, toVersionId]);

  return (
    <div className="dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div
        className="dialog-panel flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border"
        style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-lg)" }}
      >
        <div className="flex items-start justify-between border-b p-5 pb-3" style={{ borderColor: "var(--border)" }}>
          <div>
            <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
              Versiyon farkı
            </h2>
            <p className="mt-0.5 truncate text-sm" style={{ color: "var(--text-secondary)" }}>
              {fileName}
              {result && ` · v${result.versionNoFrom} → v${result.versionNoTo}`}
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost">
            Kapat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          {!error && !result && (
            <div className="space-y-2">
              <div className="skeleton h-4 w-full" />
              <div className="skeleton h-4 w-3/4" />
            </div>
          )}
          {!error && result && result.binary && (
            <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
              <p className="mb-2">
                Bu dosya metin olarak karşılaştırılamıyor (ikili/binary içerik) — sadece boyut farkı gösterilebilir:
              </p>
              <div className="flex items-center gap-3 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
                <span>
                  v{result.versionNoFrom}: <strong>{formatBytesStr(result.sizeFrom)}</strong>
                </span>
                <span>→</span>
                <span>
                  v{result.versionNoTo}: <strong>{formatBytesStr(result.sizeTo)}</strong>
                </span>
              </div>
            </div>
          )}
          {!error && result && !result.binary && (
            <pre
              className="whitespace-pre-wrap rounded-lg border p-3 font-mono text-xs leading-relaxed"
              style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}
            >
              {result.parts.map((p, i) => (
                <span
                  key={i}
                  style={{
                    display: "block",
                    background: p.added
                      ? "color-mix(in srgb, var(--success) 18%, transparent)"
                      : p.removed
                        ? "color-mix(in srgb, var(--danger) 18%, transparent)"
                        : "transparent",
                    color: p.added ? "var(--success)" : p.removed ? "var(--danger)" : "var(--text-secondary)",
                  }}
                >
                  {p.value
                    .split("\n")
                    .filter((_, idx, arr) => idx < arr.length - 1 || arr.length === 1)
                    .map((line, j) => (
                      <span key={j} style={{ display: "block" }}>
                        {p.added ? "+ " : p.removed ? "- " : "  "}
                        {line}
                      </span>
                    ))}
                </span>
              ))}
              {result.parts.length === 0 && "Fark yok — içerik aynı."}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
