"use client";

import { useEffect, useState } from "react";
import { withBasePath } from "@/lib/basePath";

type LogRow = {
  id: string;
  action: string;
  detail: string | null;
  createdAt: string;
  user: { name: string; email: string } | null;
};

const ACTION_LABELS: Record<string, string> = {
  UPLOAD: "yükledi",
  DOWNLOAD: "indirdi",
  DELETE: "çöp kutusuna taşıdı",
  RESTORE: "geri getirdi",
  RENAME: "yeniden adlandırdı",
  MOVE: "taşıdı",
  SHARE_CREATE: "paylaşım bağlantısı oluşturdu",
  SHARE_REVOKE: "paylaşımı kaldırdı",
  PERMISSION_GRANT: "izin verdi",
  PERMISSION_REVOKE: "izni kaldırdı",
  STAR: "yıldızladı",
  UNSTAR: "yıldızı kaldırdı",
  PURGE: "kalıcı olarak sildi",
};

export default function ActivityDialog({
  targetType,
  targetId,
  targetName,
  onClose,
}: {
  targetType: "file" | "folder";
  targetId: string;
  targetName: string;
  onClose: () => void;
}) {
  const [logs, setLogs] = useState<LogRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const base = targetType === "file" ? `/api/files/${targetId}/activity` : `/api/folders/${targetId}/activity`;
    fetch(withBasePath(base))
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Geçmiş yüklenemedi");
        setLogs(d.logs);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Geçmiş yüklenemedi"));
  }, [targetType, targetId]);

  return (
    <div className="dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div
        className="dialog-panel flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border"
        style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-lg)" }}
      >
        <div className="border-b p-5 pb-3" style={{ borderColor: "var(--border)" }}>
          <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            Erişim geçmişi
          </h2>
          <p className="mt-0.5 truncate text-sm" style={{ color: "var(--text-secondary)" }}>
            {targetName}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-5 pt-3">
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          {!error && !logs && (
            <div className="space-y-2">
              <div className="skeleton h-4 w-full" />
              <div className="skeleton h-4 w-3/4" />
            </div>
          )}
          {!error && logs && logs.length === 0 && (
            <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
              Henüz bir kayıt yok.
            </p>
          )}
          {!error && logs && logs.length > 0 && (
            <ul className="space-y-3">
              {logs.map((log) => (
                <li key={log.id} className="text-sm">
                  <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                    {log.user?.name ?? "Sistem"}
                  </span>{" "}
                  <span style={{ color: "var(--text-secondary)" }}>
                    {ACTION_LABELS[log.action] ?? log.action.toLowerCase()}
                  </span>
                  <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                    {new Date(log.createdAt).toLocaleString("tr-TR")}
                    {log.detail ? ` · ${log.detail}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end border-t p-4" style={{ borderColor: "var(--border)" }}>
          <button className="btn-secondary" onClick={onClose}>
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
