"use client";

import { useState } from "react";

export function InputDialog({
  title,
  label,
  initialValue = "",
  confirmLabel = "Kaydet",
  onConfirm,
  onCancel,
}: {
  title: string;
  label: string;
  initialValue?: string;
  confirmLabel?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <div className="dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <form
        className="dialog-panel w-full max-w-sm rounded-2xl border p-6"
        style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-lg)" }}
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) onConfirm(value.trim());
        }}
      >
        <h2 className="mb-3 text-base font-semibold" style={{ color: "var(--text-primary)" }}>
          {title}
        </h2>
        <label className="mb-4 block">
          <span className="mb-1 block text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            {label}
          </span>
          <input
            autoFocus
            className="input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Vazgeç
          </button>
          <button type="submit" className="btn-primary">
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel = "Sil",
  danger = true,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="dialog-panel w-full max-w-sm rounded-2xl border p-6" style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-lg)" }}>
        <h2 className="mb-2 text-base font-semibold" style={{ color: "var(--text-primary)" }}>
          {title}
        </h2>
        <p className="mb-5 text-sm" style={{ color: "var(--text-secondary)" }}>
          {description}
        </p>
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onCancel}>
            Vazgeç
          </button>
          <button
            className={
              danger
                ? "rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-400"
                : "btn-primary"
            }
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
