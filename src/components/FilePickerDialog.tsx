"use client";

import { useState } from "react";
import { iconForMime } from "@/lib/format";
import { withBasePath } from "@/lib/basePath";

type PickedFile = { id: string; name: string; mimeType: string };

/**
 * Cdrive'daki erişilebilir dosyalar arasında arama yapıp bir/birden fazla seçim döndüren
 * küçük diyalog. `mineOnly` verilirse (sohbetteki "Sürücüden ekle" gibi) SADECE kullanıcının
 * kendi sahip olduğu dosyalar aranır — normal arama ADMIN'e her şeyi, herkese de kendisiyle
 * paylaşılmış dosyaları da gösterir; bir sohbete eklerken bu istenmiyor (gerçek hata: karşı
 * tarafın kendi eklediği dosyalar bile arama sonuçlarında çıkıp tekrar eklenebiliyordu).
 */
export default function FilePickerDialog({
  initiallySelected = [],
  mineOnly = false,
  onConfirm,
  onCancel,
}: {
  initiallySelected?: PickedFile[];
  mineOnly?: boolean;
  onConfirm: (files: PickedFile[]) => void;
  onCancel: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PickedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<PickedFile[]>(initiallySelected);

  async function search(query: string) {
    setQ(query);
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const qs = new URLSearchParams({ q: query.trim() });
    if (mineOnly) qs.set("mine", "1");
    const res = await fetch(withBasePath(`/api/search?${qs.toString()}`));
    const d = await res.json().catch(() => ({ files: [] }));
    setResults(d.files ?? []);
    setLoading(false);
  }

  function toggle(f: PickedFile) {
    setSelected((s) => (s.some((x) => x.id === f.id) ? s.filter((x) => x.id !== f.id) : [...s, f]));
  }

  return (
    <div className="dialog-overlay fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 px-4">
      <div
        className="dialog-panel flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border"
        style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-lg)" }}
      >
        <div className="border-b p-5 pb-3" style={{ borderColor: "var(--border)" }}>
          <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            {mineOnly ? "Sürücümden dosya seç" : "Dosya seç"}
          </h2>
          <input
            autoFocus
            className="input mt-3"
            placeholder="Dosya adıyla ara…"
            value={q}
            onChange={(e) => search(e.target.value)}
          />
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {selected.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {selected.map((f) => (
                <span key={f.id} className="badge flex items-center gap-1">
                  {iconForMime(f.mimeType)} {f.name}
                  <button onClick={() => toggle(f)} className="text-red-600 dark:text-red-400">
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          {loading && <div className="skeleton h-8 w-full" />}
          {!loading && q.trim().length >= 2 && results.length === 0 && (
            <p className="p-2 text-sm" style={{ color: "var(--text-tertiary)" }}>
              Sonuç yok.
            </p>
          )}
          <div className="space-y-1">
            {results.map((f) => {
              const isSelected = selected.some((x) => x.id === f.id);
              return (
                <button
                  key={f.id}
                  onClick={() => toggle(f)}
                  className="flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm"
                  style={{
                    borderColor: isSelected ? "var(--accent)" : "var(--border)",
                    background: isSelected ? "var(--accent-soft)" : "transparent",
                  }}
                >
                  <span>{iconForMime(f.mimeType)}</span>
                  <span className="min-w-0 flex-1 truncate" style={{ color: "var(--text-primary)" }}>
                    {f.name}
                  </span>
                  {isSelected && <span style={{ color: "var(--accent)" }}>✓</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t p-4" style={{ borderColor: "var(--border)" }}>
          <button className="btn-ghost" onClick={onCancel}>
            Vazgeç
          </button>
          <button className="btn-primary" onClick={() => onConfirm(selected)}>
            Seç ({selected.length})
          </button>
        </div>
      </div>
    </div>
  );
}
