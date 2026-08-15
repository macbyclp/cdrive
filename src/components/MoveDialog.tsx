"use client";

import { useCallback, useEffect, useState } from "react";
import type { Crumb, FolderItem } from "@/lib/types";

export default function MoveDialog({
  itemName,
  excludeFolderId,
  onSelect,
  onClose,
}: {
  itemName: string;
  /** Bir klasör taşınıyorsa, kendi alt ağacına taşınmasını engellemek için hariç tutulacak id. */
  excludeFolderId?: string;
  onSelect: (destFolderId: string | null) => void;
  onClose: () => void;
}) {
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<Crumb[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (folderId: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const qs = folderId ? `?parentId=${folderId}` : "";
      const res = await fetch(`/api/folders${qs}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Yüklenemedi");
      }
      const data = await res.json();
      setFolders((data.folders ?? []).filter((f: FolderItem) => f.id !== excludeFolderId));
      setBreadcrumb(data.breadcrumb ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bir hata oluştu");
    } finally {
      setLoading(false);
    }
  }, [excludeFolderId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- görüntülenen klasör değişince listeyi sunucudan çek
    load(currentId);
  }, [currentId, load]);

  async function confirmHere() {
    setBusy(true);
    await onSelect(currentId);
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div
        className="flex w-full max-w-md flex-col overflow-hidden rounded-2xl border shadow-lg"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div className="border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
          <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            Taşı
          </h2>
          <p className="mt-0.5 truncate text-sm" style={{ color: "var(--text-secondary)" }}>
            &quot;{itemName}&quot; için hedef klasör seç
          </p>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto border-b px-6 py-2 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
          <button onClick={() => setCurrentId(null)} className="shrink-0 hover:underline" style={{ color: "inherit" }}>
            Sürücüm
          </button>
          {breadcrumb.map((c) => (
            <span key={c.id} className="flex shrink-0 items-center gap-1">
              <span>/</span>
              <button onClick={() => setCurrentId(c.id)} className="hover:underline">
                {c.name}
              </button>
            </span>
          ))}
        </div>

        <div className="max-h-72 min-h-[8rem] overflow-y-auto px-2 py-2">
          {error && <p className="px-4 py-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
          {loading && (
            <div className="space-y-2 px-2 py-1">
              <div className="skeleton h-9 w-full" />
              <div className="skeleton h-9 w-full" />
            </div>
          )}
          {!loading && folders.length === 0 && (
            <p className="px-4 py-2 text-sm" style={{ color: "var(--text-tertiary)" }}>
              Alt klasör yok.
            </p>
          )}
          {folders.map((f) => (
            <button
              key={f.id}
              onClick={() => setCurrentId(f.id)}
              className="flex w-full items-center gap-2 rounded-lg px-4 py-2 text-left text-sm hover:opacity-80"
              style={{ color: "var(--text-primary)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span>📁</span>
              {f.name}
            </button>
          ))}
        </div>

        <div className="flex justify-end gap-2 border-t px-6 py-4" style={{ borderColor: "var(--border)" }}>
          <button className="btn-secondary" onClick={onClose}>
            Vazgeç
          </button>
          <button disabled={busy} className="btn-primary" onClick={confirmHere}>
            Buraya taşı
          </button>
        </div>
      </div>
    </div>
  );
}
