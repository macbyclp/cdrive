"use client";

import { use, useEffect, useRef, useState } from "react";
import Script from "next/script";
import { useMe } from "@/lib/useMe";
import { withBasePath } from "@/lib/basePath";

type OfficeConfig = {
  script: string;
  config: Record<string, unknown>;
  fileName: string;
};

declare global {
  interface Window {
    DocsAPI?: { DocEditor: new (id: string, config: Record<string, unknown>) => unknown };
  }
}

export default function OfficePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, refresh } = useMe();
  const [data, setData] = useState<OfficeConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const editorInitialized = useRef(false);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetch(withBasePath(`/api/files/${id}/office/config`))
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? "Editör açılamadı");
        setData(body);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Editör açılamadı"));
  }, [id]);

  useEffect(() => {
    if (!data || !scriptReady || editorInitialized.current || !window.DocsAPI) return;
    editorInitialized.current = true;
    new window.DocsAPI.DocEditor("office-editor-container", data.config);
  }, [data, scriptReady]);

  if (!user) return null;

  return (
    <div className="flex h-screen flex-col" style={{ background: "var(--surface-muted)" }}>
      <div
        className="flex shrink-0 items-center justify-between border-b px-4 py-2"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <span className="truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          {data?.fileName ?? "Belge açılıyor…"}
        </span>
        <button className="btn-ghost text-xs" onClick={() => window.close()}>
          Kapat
        </button>
      </div>

      {error && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {error}
          </p>
          <a href={withBasePath("/drive")} className="btn-secondary">
            Sürücüme dön
          </a>
        </div>
      )}

      {!error && !data && (
        <div className="flex flex-1 items-center justify-center">
          <div className="skeleton h-8 w-48" />
        </div>
      )}

      {!error && data && (
        <>
          <Script src={data.script} strategy="afterInteractive" onReady={() => setScriptReady(true)} />
          <div id="office-editor-container" className="flex-1" />
        </>
      )}
    </div>
  );
}
