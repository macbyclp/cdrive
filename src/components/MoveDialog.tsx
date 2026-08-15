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
      <div className="flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">Taşı</h2>
          <p className="mt-0.5 truncate text-sm text-slate-500">&quot;{itemName}&quot; için hedef klasör seç</p>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-100 px-6 py-2 text-sm text-slate-500">
          <button onClick={() => setCurrentId(null)} className="shrink-0 hover:text-slate-900 hover:underline">
            Sürücüm
          </button>
          {breadcrumb.map((c) => (
            <span key={c.id} className="flex shrink-0 items-center gap-1">
              <span>/</span>
              <button onClick={() => setCurrentId(c.id)} className="hover:text-slate-900 hover:underline">
                {c.name}
              </button>
            </span>
          ))}
        </div>

        <div className="max-h-72 min-h-[8rem] overflow-y-auto px-2 py-2">
          {error && <p className="px-4 py-2 text-sm text-red-600">{error}</p>}
          {loading && <p className="px-4 py-2 text-sm text-slate-400">Yükleniyor…</p>}
          {!loading && folders.length === 0 && (
            <p className="px-4 py-2 text-sm text-slate-400">Alt klasör yok.</p>
          )}
          {folders.map((f) => (
            <button
              key={f.id}
              onClick={() => setCurrentId(f.id)}
              className="flex w-full items-center gap-2 rounded-lg px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
            >
              <span>📁</span>
              {f.name}
            </button>
          ))}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
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
