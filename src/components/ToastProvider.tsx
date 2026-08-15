"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

type ToastKind = "info" | "success" | "error";
type Toast = { id: number; message: string; kind: ToastKind };

type ToastContextValue = {
  toast: (message: string, kind?: ToastKind) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const kindStyles: Record<ToastKind, { border: string; icon: string }> = {
  info: { border: "#0f172a", icon: "ℹ️" },
  success: { border: "#16a34a", icon: "✅" },
  error: { border: "#dc2626", icon: "⚠️" },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const toast = useCallback((message: string, kind: ToastKind = "info") => {
    const id = ++counter.current;
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="toast pointer-events-auto flex max-w-sm items-start gap-2 rounded-lg border-l-4 px-4 py-3 text-sm shadow-lg"
            style={{
              background: "var(--surface)",
              color: "var(--text-primary)",
              borderColor: kindStyles[t.kind].border,
            }}
          >
            <span>{kindStyles[t.kind].icon}</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast, ToastProvider içinde kullanılmalı");
  return ctx.toast;
}
