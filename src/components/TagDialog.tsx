"use client";

import { useEffect, useState } from "react";
import { withBasePath } from "@/lib/basePath";
import { useToast } from "@/components/ToastProvider";
import type { Tag } from "@/lib/types";

const PALETTE = ["#6366f1", "#ec4899", "#f59e0b", "#16a34a", "#0891b2", "#dc2626", "#7c3aed", "#64748b"];

export default function TagDialog({
  targetType,
  targetId,
  targetName,
  currentTags,
  onClose,
  onChanged,
}: {
  targetType: "file" | "folder";
  targetId: string;
  targetName: string;
  currentTags: Tag[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [applied, setApplied] = useState<Set<string>>(new Set(currentTags.map((t) => t.id)));
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PALETTE[0]);
  const [busy, setBusy] = useState(false);

  const base = targetType === "file" ? `/api/files/${targetId}/tags` : `/api/folders/${targetId}/tags`;

  function load() {
    fetch(withBasePath("/api/tags"))
      .then((r) => r.json())
      .then((d) => setAllTags(d.tags ?? []));
  }

  useEffect(() => {
    load();
  }, []);

  async function toggle(tag: Tag) {
    const has = applied.has(tag.id);
    setBusy(true);
    const res = await fetch(withBasePath(has ? `${base}/${tag.id}` : base), {
      method: has ? "DELETE" : "POST",
      headers: has ? undefined : { "Content-Type": "application/json" },
      body: has ? undefined : JSON.stringify({ tagId: tag.id }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast(d.error ?? "İşlem başarısız", "error");
      return;
    }
    setApplied((s) => {
      const next = new Set(s);
      if (has) next.delete(tag.id);
      else next.add(tag.id);
      return next;
    });
    onChanged();
  }

  async function createTag(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true);
    const res = await fetch(withBasePath("/api/tags"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), color: newColor }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast(d.error ?? "Etiket oluşturulamadı", "error");
      return;
    }
    const tag: Tag = await res.json();
    setNewName("");
    setAllTags((prev) => (prev.some((t) => t.id === tag.id) ? prev : [...prev, tag].sort((a, b) => a.name.localeCompare(b.name))));
    await toggle(tag);
  }

  async function deleteTag(tag: Tag) {
    setBusy(true);
    await fetch(withBasePath(`/api/tags/${tag.id}`), { method: "DELETE" });
    setBusy(false);
    setAllTags((prev) => prev.filter((t) => t.id !== tag.id));
    setApplied((s) => {
      const next = new Set(s);
      next.delete(tag.id);
      return next;
    });
    onChanged();
  }

  return (
    <div className="dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div
        className="dialog-panel w-full max-w-sm rounded-2xl border p-6"
        style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-lg)" }}
      >
        <h2 className="mb-1 text-base font-semibold" style={{ color: "var(--text-primary)" }}>
          Etiketler
        </h2>
        <p className="mb-4 truncate text-sm" style={{ color: "var(--text-secondary)" }}>
          {targetName}
        </p>

        <div className="mb-4 max-h-56 space-y-1 overflow-y-auto">
          {allTags.length === 0 && (
            <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
              Henüz hiç etiket yok — aşağıdan ilkini oluştur.
            </p>
          )}
          {allTags.map((tag) => (
            <div
              key={tag.id}
              className="group flex items-center gap-2 rounded-lg px-2 py-1.5"
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <label className="flex flex-1 cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={applied.has(tag.id)}
                  disabled={busy}
                  onChange={() => toggle(tag)}
                />
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: tag.color }} />
                <span className="truncate text-sm" style={{ color: "var(--text-primary)" }}>
                  {tag.name}
                </span>
              </label>
              <button
                className="shrink-0 text-xs opacity-0 transition-opacity group-hover:opacity-100"
                style={{ color: "var(--text-tertiary)" }}
                title="Etiketi tamamen sil"
                onClick={() => deleteTag(tag)}
              >
                Sil
              </button>
            </div>
          ))}
        </div>

        <form onSubmit={createTag} className="space-y-2 border-t pt-3" style={{ borderColor: "var(--border)" }}>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder="Yeni etiket adı"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={40}
            />
            <button type="submit" disabled={busy || !newName.trim()} className="btn-secondary shrink-0 text-xs">
              Ekle
            </button>
          </div>
          <div className="flex gap-1.5">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setNewColor(c)}
                className="h-5 w-5 rounded-full"
                style={{ background: c, outline: newColor === c ? "2px solid var(--accent)" : undefined, outlineOffset: 2 }}
                aria-label={c}
              />
            ))}
          </div>
        </form>

        <div className="mt-4 flex justify-end">
          <button className="btn-secondary" onClick={onClose}>
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
