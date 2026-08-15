"use client";

import { useEffect, useState } from "react";
import { formatBytesStr, formatDate } from "@/lib/format";

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
  const [versions, setVersions] = useState<Version[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/files/${fileId}/versions`)
      .then((r) => r.json())
      .then(setVersions);
  }, [fileId]);

  async function restore(versionId: string) {
    setBusy(true);
    await fetch(`/api/files/${fileId}/versions/${versionId}/restore`, { method: "POST" });
    setBusy(false);
    onRestored();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Versiyon geçmişi</h2>
            <p className="text-sm text-slate-500 truncate max-w-xs">{fileName}</p>
          </div>
          <button onClick={onClose} className="btn-ghost">
            Kapat
          </button>
        </div>
        <div className="space-y-2">
          {versions.map((v, idx) => (
            <div key={v.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <div>
                <div className="font-medium text-slate-800">
                  v{v.versionNo} {idx === 0 && <span className="ml-1 rounded bg-slate-900 px-1.5 py-0.5 text-[10px] text-white">güncel</span>}
                </div>
                <div className="text-xs text-slate-500">
                  {formatBytesStr(v.size)} · {v.uploadedBy.name} · {formatDate(v.createdAt)}
                </div>
              </div>
              {idx !== 0 && (
                <button disabled={busy} className="btn-secondary text-xs" onClick={() => restore(v.id)}>
                  Bu versiyonu geri yükle
                </button>
              )}
            </div>
          ))}
          {versions.length === 0 && <p className="text-sm text-slate-400">Versiyon bulunamadı.</p>}
        </div>
      </div>
    </div>
  );
}
