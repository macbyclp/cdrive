"use client";

import { useEffect, useState } from "react";
import { formatDate } from "@/lib/format";
import { useToast } from "@/components/ToastProvider";
import { withBasePath } from "@/lib/basePath";

type Comment = {
  id: string;
  content: string;
  createdAt: string;
  user: { id: string; name: string; email: string };
};

export default function CommentsDialog({
  fileId,
  fileName,
  currentUserId,
  isAdmin,
  onClose,
}: {
  fileId: string;
  fileName: string;
  currentUserId: string;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    fetch(withBasePath(`/api/files/${fileId}/comments`))
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Yorumlar yüklenemedi");
        setComments(d);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Yorumlar yüklenemedi"));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setBusy(true);
    const res = await fetch(withBasePath(`/api/files/${fileId}/comments`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: draft.trim() }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast(d.error ?? "Yorum eklenemedi", "error");
      return;
    }
    setDraft("");
    load();
  }

  async function remove(id: string) {
    await fetch(withBasePath(`/api/files/${fileId}/comments/${id}`), { method: "DELETE" });
    load();
  }

  return (
    <div className="dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div
        className="dialog-panel flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border"
        style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-lg)" }}
      >
        <div className="border-b p-5 pb-3" style={{ borderColor: "var(--border)" }}>
          <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            Yorumlar
          </h2>
          <p className="mt-0.5 truncate text-sm" style={{ color: "var(--text-secondary)" }}>
            {fileName}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-5 pt-3">
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          {!error && !comments && (
            <div className="space-y-2">
              <div className="skeleton h-10 w-full" />
              <div className="skeleton h-10 w-3/4" />
            </div>
          )}
          {!error && comments && comments.length === 0 && (
            <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
              Henüz yorum yok. İlk yorumu sen yaz.
            </p>
          )}
          {!error && comments && comments.length > 0 && (
            <ul className="space-y-3">
              {comments.map((c) => (
                <li key={c.id} className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--border)" }}>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                      {c.user.name}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                        {formatDate(c.createdAt)}
                      </span>
                      {(c.user.id === currentUserId || isAdmin) && (
                        <button
                          className="text-xs text-red-600 dark:text-red-400"
                          onClick={() => remove(c.id)}
                        >
                          Sil
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>
                    {c.content}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <form onSubmit={submit} className="flex gap-2 border-t p-4" style={{ borderColor: "var(--border)" }}>
          <input
            className="input flex-1"
            placeholder="Bir yorum yaz…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={2000}
          />
          <button disabled={busy || !draft.trim()} className="btn-primary shrink-0">
            Gönder
          </button>
        </form>
        <div className="flex justify-end px-4 pb-4">
          <button className="btn-ghost" onClick={onClose}>
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
