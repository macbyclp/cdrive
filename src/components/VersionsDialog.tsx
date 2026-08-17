"use client";

import { useEffect, useState } from "react";
import { formatBytesStr, formatDate } from "@/lib/format";
import { useToast } from "@/components/ToastProvider";
import { withBasePath } from "@/lib/basePath";

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
                className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: "var(--border)" }}
              >
                <div>
                  <div className="font-medium" style={{ color: "var(--text-primary)" }}>
                    v{v.versionNo}{" "}
                    {idx === 0 && <span className="badge ml-1">güncel</span>}
                  </div>
                  <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    {formatBytesStr(v.size)} · {v.uploadedBy.name} · {formatDate(v.createdAt)}
                  </div>
                </div>
                {idx !== 0 && (
                  <button disabled={busy} className="btn-secondary text-xs" onClick={() => restore(v.id, v.versionNo)}>
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
    </div>
  );
}
