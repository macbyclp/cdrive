"use client";

import { useEffect, useState } from "react";
import { formatBytesStr, formatDate } from "@/lib/format";
import { useToast } from "@/components/ToastProvider";
import { withBasePath } from "@/lib/basePath";
import VersionDiffDialog from "@/components/VersionDiffDialog";

type Version = {
  id: string;
  versionNo: number;
  size: string;
  createdAt: string;
  uploadedBy: { name: string; email: string };
};

export default function VersionsDialog({
  fileId,
  fileName,
  onClose,
  onRestored,
}: {
  fileId: string;
  fileName: string;
  onClose: () => void;
  onRestored: () => void;
}) {
  const toast = useToast();
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [diffPair, setDiffPair] = useState<{ from: string; to: string } | null>(null);

  useEffect(() => {
    fetch(withBasePath(`/api/files/${fileId}/versions`))
      .then((r) => r.json())
      .then((v) => {
        setVersions(v);
        setLoading(false);
      });
  }, [fileId]);

  async function restore(versionId: string, versionNo: number) {
    setBusy(true);
    await fetch(withBasePath(`/api/files/${fileId}/versions/${versionId}/restore`), { method: "POST" });
    setBusy(false);
    toast(`v${versionNo} geri yüklendi`, "success");
    onRestored();
    onClose();
  }

  function toggleCompare(versionId: string) {
    setCompareIds((ids) => {
      if (ids.includes(versionId)) return ids.filter((id) => id !== versionId);
      if (ids.length >= 2) return [ids[1], versionId];
      return [...ids, versionId];
    });
  }

  function openDiff() {
    if (compareIds.length !== 2) return;
    // Eski versiyon "from", yeni versiyon "to" olsun (versionNo'ya göre sırala).
    const [a, b] = compareIds;
    const va = versions.find((v) => v.id === a);
    const vb = versions.find((v) => v.id === b);
    if (!va || !vb) return;
    const [from, to] = va.versionNo <= vb.versionNo ? [a, b] : [b, a];
    setDiffPair({ from, to });
  }

  return (
    <div className="dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div
        className="dialog-panel w-full max-w-lg rounded-2xl border p-6"
        style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-lg)" }}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
              Versiyon geçmişi
            </h2>
            <p className="max-w-xs truncate text-sm" style={{ color: "var(--text-secondary)" }}>
              {fileName}
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost">
            Kapat
          </button>
        </div>
        {versions.length > 1 && (
          <div className="mb-3 flex items-center justify-between rounded-lg border px-3 py-2 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
            <span>Karşılaştırmak için iki versiyon seç ({compareIds.length}/2)</span>
            <button disabled={compareIds.length !== 2} className="btn-secondary text-xs" onClick={openDiff}>
              Farkları gör
            </button>
          </div>
        )}
        <div className="space-y-2">
          {loading && (
            <>
              <div className="skeleton h-12 w-full" />
              <div className="skeleton h-12 w-full" />
            </>
          )}
          {!loading &&
            versions.map((v, idx) => (
              <div
                key={v.id}
                className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="flex items-center gap-2">
                  {versions.length > 1 && (
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5"
                      checked={compareIds.includes(v.id)}
                      onChange={() => toggleCompare(v.id)}
                      title="Karşılaştırmak için seç"
                    />
                  )}
                  <div>
                    <div className="font-medium" style={{ color: "var(--text-primary)" }}>
                      v{v.versionNo}{" "}
                      {idx === 0 && <span className="badge ml-1">güncel</span>}
                    </div>
                    <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      {formatBytesStr(v.size)} · {v.uploadedBy.name} · {formatDate(v.createdAt)}
                    </div>
                  </div>
                </div>
                {idx !== 0 && (
                  <button disabled={busy} className="btn-secondary text-xs shrink-0" onClick={() => restore(v.id, v.versionNo)}>
                    Bu versiyonu geri yükle
                  </button>
                )}
              </div>
            ))}
          {!loading && versions.length === 0 && (
            <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
              Versiyon bulunamadı.
            </p>
          )}
        </div>
      </div>
      {diffPair && (
        <VersionDiffDialog
          fileId={fileId}
          fileName={fileName}
          fromVersionId={diffPair.from}
          toVersionId={diffPair.to}
          onClose={() => setDiffPair(null)}
        />
      )}
    </div>
  );
}
