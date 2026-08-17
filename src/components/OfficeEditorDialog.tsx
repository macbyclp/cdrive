"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { withBasePath } from "@/lib/basePath";
import { ConfirmDialog } from "@/components/Dialogs";
import "@/lib/onlyoffice-client";
import type { DocEditorInstance } from "@/lib/onlyoffice-client";

type OfficeConfig = { script: string; config: Record<string, unknown>; fileName: string };

/**
 * Word/Excel/PowerPoint düzenleyicisini yeni bir sekme yerine sayfa üstünde
 * bir popup olarak açar. "Kaydet ve Kapat", OnlyOffice'in editörü DÜZGÜN
 * kapatma API'sini (destroyEditor) çağırır — bu, Document Server'ın belgeyi
 * son haliyle kaydedip (bkz. /api/files/[id]/office/callback) bize haber
 * vermesini tetikler. "İptal" ise editörü düzgün kapatmadan (destroyEditor
 * çağırmadan) kaldırır — OnlyOffice'in kendi periyodik otomatik kaydetmesi
 * hâlâ ara ara devreye girmiş olabilir, bu yüzden "kaydedilmemiş SON
 * değişiklikler kaybolabilir" diye dürüstçe uyarıyoruz, "hiçbir şey
 * kaydedilmeyecek" diye kesin bir söz vermiyoruz.
 */
export default function OfficeEditorDialog({
  fileId,
  fileName,
  onClose,
  onSaved,
}: {
  fileId: string;
  fileName: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [data, setData] = useState<OfficeConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const editorInitialized = useRef(false);
  const editorRef = useRef<DocEditorInstance | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setConfirmDiscard(true);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    fetch(withBasePath(`/api/files/${fileId}/office/config`))
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? "Editör açılamadı");
        setData(body);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Editör açılamadı"));
  }, [fileId]);

  useEffect(() => {
    if (!data || !scriptReady || editorInitialized.current || !window.DocsAPI) return;
    editorInitialized.current = true;
    editorRef.current = new window.DocsAPI.DocEditor("office-editor-container", data.config);
  }, [data, scriptReady]);

  function saveAndClose() {
    try {
      editorRef.current?.destroyEditor?.();
    } catch {
      // editör zaten kapanmış/hiç açılmamış olabilir — yine de popup'ı kapatıyoruz
    }
    onSaved?.();
    onClose();
  }

  return (
    <div className="dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60">
      <div
        className="dialog-panel flex h-screen w-screen flex-col overflow-hidden"
        style={{ background: "var(--surface)" }}
      >
        <div
          className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2.5"
          style={{ borderColor: "var(--border)" }}
        >
          <span className="truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            {data?.fileName ?? fileName}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <button className="btn-ghost text-xs" onClick={() => setConfirmDiscard(true)}>
              İptal
            </button>
            <button className="btn-primary text-xs" onClick={saveAndClose}>
              Kaydet ve Kapat
            </button>
          </div>
        </div>

        {error && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {error}
            </p>
            <button className="btn-secondary" onClick={onClose}>
              Kapat
            </button>
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

      {confirmDiscard && (
        <ConfirmDialog
          title="Kaydetmeden kapat"
          description="Az önceki değişiklikler henüz kaydedilmemiş olabilir, kapatınca kaybolabilirler. Yine de kapatmak istiyor musun?"
          confirmLabel="Kaydetmeden kapat"
          onConfirm={() => {
            setConfirmDiscard(false);
            onClose();
          }}
          onCancel={() => setConfirmDiscard(false)}
        />
      )}
    </div>
  );
}
