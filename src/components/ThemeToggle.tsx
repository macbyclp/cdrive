"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import type { ThemePreference } from "@/lib/theme";

const options: { value: ThemePreference; label: string; icon: string }[] = [
  { value: "light", label: "Açık", icon: "☀️" },
  { value: "dark", label: "Koyu", icon: "🌙" },
  { value: "system", label: "Sistem", icon: "🖥️" },
];

export default function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const current = options.find((o) => o.value === preference) ?? options[2];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="btn-ghost flex items-center gap-1"
        aria-label="Tema seç"
        title="Tema"
      >
        <span>{current.icon}</span>
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-20 mt-1 w-32 overflow-hidden rounded-lg border py-1 shadow-lg"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          {options.map((o) => (
            <button
              key={o.value}
              onClick={() => {
                setPreference(o.value);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:opacity-80"
              style={{
                color: "var(--text-primary)",
                background: preference === o.value ? "var(--surface-muted)" : "transparent",
              }}
            >
              <span>{o.icon}</span>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
