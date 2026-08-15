"use client";

import { useEffect, useState } from "react";
import { previewKind } from "@/lib/format";

export default function PreviewDialog({
  fileId,
  fileName,
  mimeType,
  onClose,
}: {
  fileId: string;
  fileName: string;
  mimeType: string;
  onClose: () => void;
}) {
  const kind = previewKind(mimeType);
  const src = `/api/files/${fileId}?inline=1`;
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (kind !== "text") return;
    fetch(src)
      .then((r) => {
        if (!r.ok) throw new Error("Dosya okunamadı");
        return r.text();
      })
      .then((t) => setText(t.slice(0, 200_000)))
      .catch((e) => setError(e instanceof Error ? e.message : "Dosya okunamadı"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="flex h-full max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="truncate text-sm font-semibold text-slate-900">{fileName}</h2>
          <div className="flex shrink-0 items-center gap-2">
            <a href={`/api/files/${fileId}`} className="btn-secondary text-xs">
              İndir
            </a>
            <button className="btn-ghost" onClick={onClose}>
              Kapat
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-slate-50">
          {kind === "image" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={fileName} className="mx-auto max-h-full max-w-full object-contain p-4" />
          )}
          {kind === "pdf" && <iframe src={src} title={fileName} className="h-full w-full border-0" />}
          {kind === "text" && (
            <div className="p-4">
              {error && <p className="text-sm text-red-600">{error}</p>}
              {!error && text === null && <p className="text-sm text-slate-400">Yükleniyor…</p>}
              {text !== null && (
                <pre className="whitespace-pre-wrap break-words rounded-lg bg-white p-4 text-xs text-slate-800 shadow-sm">
                  {text}
                </pre>
              )}
            </div>
          )}
          {kind === "none" && (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <p className="text-sm text-slate-500">Bu dosya türü için önizleme desteklenmiyor.</p>
              <a href={`/api/files/${fileId}`} className="btn-primary">
                Dosyayı indir
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
