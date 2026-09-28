"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { MOTION_STORAGE_KEY, resolveMotion, type MotionPreference, type ThemePreference } from "@/lib/theme";

// Tek renkli (currentColor) çizgi ikonlar — Liquid Glass'ın nötr paletiyle uyumlu.
function ThemeIcon({ kind }: { kind: ThemePreference }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={18}
      height={18}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === "light" && (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
        </>
      )}
      {kind === "dark" && <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />}
      {kind === "system" && (
        <>
          <rect x="3" y="4" width="18" height="12" rx="2.5" />
          <path d="M8 20h8M12 16v4" />
        </>
      )}
    </svg>
  );
}

const options: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Açık" },
  { value: "dark", label: "Koyu" },
  { value: "system", label: "Sistem" },
];

const motionOptions: { value: MotionPreference; label: string }[] = [
  { value: "system", label: "Sistem" },
  { value: "on", label: "Açık" },
  { value: "off", label: "Kapalı" },
];

function readMotion(): MotionPreference {
  try {
    const v = localStorage.getItem(MOTION_STORAGE_KEY);
    return v === "on" || v === "off" ? v : "system";
  } catch {
    return "system";
  }
}

export default function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  const [open, setOpen] = useState(false);
  // Menü kapalıyken hiçbir yerde görünmediği için lazy başlangıç (localStorage) hidrasyon uyuşmazlığı yaratmaz.
  const [motion, setMotionState] = useState<MotionPreference>(readMotion);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function setMotion(pref: MotionPreference) {
    setMotionState(pref);
    try {
      if (pref === "system") localStorage.removeItem(MOTION_STORAGE_KEY);
      else localStorage.setItem(MOTION_STORAGE_KEY, pref);
    } catch {
      // Depolama kapalıysa tercih yalnızca bu oturumda geçerli olur.
    }
    document.documentElement.setAttribute("data-motion", resolveMotion(pref));
  }

  const current = options.find((o) => o.value === preference) ?? options[2];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="btn-ghost flex items-center gap-1"
        aria-label="Görünüm ayarları"
        aria-expanded={open}
        title="Tema ve hareket"
      >
        <ThemeIcon kind={current.value} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-30 mt-2 w-52 overflow-hidden rounded-2xl border p-1.5"
          style={{ background: "var(--surface)", borderColor: "var(--glass-line)", boxShadow: "var(--glass-edge), var(--shadow-lg)" }}
        >
          <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
            Tema
          </div>
          {options.map((o) => (
            <button
              key={o.value}
              onClick={() => setPreference(o.value)}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm"
              style={{
                color: "var(--text-primary)",
                background: preference === o.value ? "var(--surface-hover)" : "transparent",
              }}
            >
              <ThemeIcon kind={o.value} />
              {o.label}
            </button>
          ))}
          <div className="px-2.5 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
            Su efekti ve hareket
          </div>
          <div className="flex gap-1 px-1 pb-1">
            {motionOptions.map((o) => (
              <button
                key={o.value}
                onClick={() => setMotion(o.value)}
                className="flex-1 rounded-xl px-2 py-1.5 text-xs font-medium"
                style={{
                  color: "var(--text-primary)",
                  background: motion === o.value ? "var(--surface-hover)" : "transparent",
                  boxShadow: motion === o.value ? "inset 0 0 0 1px var(--glass-line)" : "none",
                }}
                aria-pressed={motion === o.value}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
