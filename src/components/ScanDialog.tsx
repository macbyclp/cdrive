"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { withBasePath } from "@/lib/basePath";
import { canvasToJpeg, renderPage, toSourceCanvas, type ScanFilter } from "@/lib/scan-image";

type Page = {
  id: number;
  source: HTMLCanvasElement;
  rotation: number;
  filter: ScanFilter;
  thumb: string;
};

const FILTERS: ScanFilter[] = ["original", "document", "bw"];
const MAX_PAGES = 40;

function defaultName() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `Tarama ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}`;
}

function makeThumb(source: HTMLCanvasElement, rotation: number, filter: ScanFilter) {
  return renderPage(source, rotation, filter, 360).toDataURL("image/jpeg", 0.7);
}

/** Kamera veya görsel dosyalarından sayfa toplayıp tek PDF olarak klasöre yükleyen belge tarayıcı. */
export default function ScanDialog({
  folderId,
  onClose,
  onSaved,
  onError,
}: {
  folderId: string | null;
  onClose: () => void;
  onSaved: (name: string, ocr: boolean, docxName: string | null) => void;
  onError: (message: string) => void;
}) {
  const t = useTranslations("scan");
  const [pages, setPages] = useState<Page[]>([]);
  const [name, setName] = useState(defaultName);
  const [ocr, setOcr] = useState(true);
  const [docx, setDocx] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [defaultFilter, setDefaultFilter] = useState<ScanFilter>("document");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  async function startCamera() {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOn(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
    } catch {
      setCameraError(t("cameraUnavailable"));
    }
  }

  function addSource(source: HTMLCanvasElement) {
    setPages((prev) => {
      if (prev.length >= MAX_PAGES) return prev;
      const page: Page = {
        id: nextId.current++,
        source,
        rotation: 0,
        filter: defaultFilter,
        thumb: makeThumb(source, 0, defaultFilter),
      };
      return [...prev, page];
    });
  }

  function capture() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    addSource(toSourceCanvas(v, v.videoWidth, v.videoHeight));
  }

  async function addFiles(list: FileList | null) {
    if (!list) return;
    for (const file of Array.from(list)) {
      if (!file.type.startsWith("image/")) continue;
      try {
        const bmp = await createImageBitmap(file);
        addSource(toSourceCanvas(bmp, bmp.width, bmp.height));
        bmp.close();
      } catch {
        onError(`${file.name}: ${t("unreadableImage")}`);
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  function update(id: number, patch: Partial<Pick<Page, "rotation" | "filter">>) {
    setPages((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const next = { ...p, ...patch };
        next.thumb = makeThumb(next.source, next.rotation, next.filter);
        return next;
      })
    );
  }

  function move(index: number, dir: -1 | 1) {
    setPages((prev) => {
      const j = index + dir;
      if (j < 0 || j >= prev.length) return prev;
      const copy = [...prev];
      [copy[index], copy[j]] = [copy[j], copy[index]];
      return copy;
    });
  }

  async function save() {
    if (pages.length === 0 || saving) return;
    setSaving(true);
    stopCamera();
    try {
      const fd = new FormData();
      if (folderId) fd.append("folderId", folderId);
      fd.append("name", name.trim() || defaultName());
      fd.append("ocr", ocr || docx ? "1" : "0");
      fd.append("docx", docx ? "1" : "0");
      for (const [i, p] of pages.entries()) {
        const blob = await canvasToJpeg(renderPage(p.source, p.rotation, p.filter));
        fd.append("pages", blob, `page-${i + 1}.jpg`);
      }
      const res = await fetch(withBasePath("/api/files/scan"), { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        onError(d.error ?? t("saveFailed"));
        setSaving(false);
        return;
      }
      onSaved(d.name, Boolean(d.ocr), d.docxName ?? null);
    } catch {
      onError(t("saveFailed"));
      setSaving(false);
    }
  }

  return (
    <div className="dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div
        className="dialog-panel flex max-h-[92vh] w-full max-w-3xl flex-col rounded-2xl border p-5"
        style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-lg)" }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            {t("title")}
          </h2>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
            {t("close")}
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {cameraOn ? (
            <div className="space-y-2">
              <video ref={videoRef} playsInline muted className="max-h-[45vh] w-full rounded-xl bg-black object-contain" />
              <div className="flex gap-2">
                <button type="button" className="btn-primary" onClick={capture} disabled={pages.length >= MAX_PAGES}>
                  {t("capture")}
                </button>
                <button type="button" className="btn-secondary" onClick={stopCamera}>
                  {t("stopCamera")}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn-primary" onClick={startCamera} disabled={pages.length >= MAX_PAGES}>
                {t("openCamera")}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => fileRef.current?.click()}
                disabled={pages.length >= MAX_PAGES}
              >
                {t("pickImages")}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => void addFiles(e.target.files)}
              />
              <label className="ml-auto flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                {t("newPageFilter")}
                <select
                  className="input !w-auto"
                  value={defaultFilter}
                  onChange={(e) => setDefaultFilter(e.target.value as ScanFilter)}
                >
                  {FILTERS.map((f) => (
                    <option key={f} value={f}>
                      {t(`filter.${f}`)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {cameraError && (
            <p className="text-sm" style={{ color: "var(--danger, #dc2626)" }}>
              {cameraError}
            </p>
          )}

          {pages.length === 0 ? (
            <p
              className="rounded-xl border border-dashed p-6 text-center text-sm"
              style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
            >
              {t("empty")}
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {pages.map((p, i) => (
                <li key={p.id} className="rounded-xl border p-2" style={{ borderColor: "var(--border)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.thumb}
                    alt={t("pageN", { n: i + 1 })}
                    className="h-40 w-full rounded-lg bg-slate-100 object-contain"
                  />
                  <div className="mt-1 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                    {t("pageN", { n: i + 1 })}
                  </div>
                  <select
                    className="input mt-1 !py-1 text-xs"
                    value={p.filter}
                    onChange={(e) => update(p.id, { filter: e.target.value as ScanFilter })}
                    aria-label={t("newPageFilter")}
                  >
                    {FILTERS.map((f) => (
                      <option key={f} value={f}>
                        {t(`filter.${f}`)}
                      </option>
                    ))}
                  </select>
                  <div className="mt-1 flex gap-1">
                    <button
                      type="button"
                      className="btn-secondary !px-2 !py-1 text-xs"
                      title={t("rotate")}
                      onClick={() => update(p.id, { rotation: (p.rotation + 90) % 360 })}
                    >
                      ⟳
                    </button>
                    <button
                      type="button"
                      className="btn-secondary !px-2 !py-1 text-xs"
                      title={t("moveLeft")}
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      className="btn-secondary !px-2 !py-1 text-xs"
                      title={t("moveRight")}
                      disabled={i === pages.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      →
                    </button>
                    <button
                      type="button"
                      className="btn-secondary ml-auto !px-2 !py-1 text-xs"
                      title={t("remove")}
                      onClick={() => setPages((prev) => prev.filter((x) => x.id !== p.id))}
                    >
                      🗑
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3 border-t pt-4" style={{ borderColor: "var(--border)" }}>
          <label className="min-w-[14rem] flex-1">
            <span className="mb-1 block text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              {t("fileName")}
            </span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </label>
          <label
            className="flex items-center gap-2 pb-2 text-sm"
            style={{ color: "var(--text-primary)" }}
            title={t("ocrHint")}
          >
            <input
              type="checkbox"
              checked={ocr || docx}
              disabled={docx}
              onChange={(e) => setOcr(e.target.checked)}
            />
            {t("ocr")}
          </label>
          <label
            className="flex items-center gap-2 pb-2 text-sm"
            style={{ color: "var(--text-primary)" }}
            title={t("docxHint")}
          >
            <input type="checkbox" checked={docx} onChange={(e) => setDocx(e.target.checked)} />
            {t("docx")}
          </label>
          <button type="button" className="btn-primary" onClick={save} disabled={pages.length === 0 || saving}>
            {saving ? t("saving") : t("save", { count: pages.length })}
          </button>
        </div>
      </div>
    </div>
  );
}
