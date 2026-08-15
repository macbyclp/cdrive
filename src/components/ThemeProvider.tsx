"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { resolveTheme, THEME_STORAGE_KEY, type ThemePreference } from "@/lib/theme";

type ThemeContextValue = {
  preference: ThemePreference;
  resolved: "light" | "dark";
  setPreference: (pref: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // İlk render her zaman "system"/"light" ile başlar (sunucuyla eşleşsin, hydration
  // uyuşmazlığı olmasın); gerçek tema zaten themeInitScript ile <html data-theme>'e
  // boyamadan önce yazılıyor. Bu efekt sadece React state'ini localStorage'daki gerçek
  // tercihle senkronize ediyor (dış sistemden okuma — kasıtlı, döngüsel değil).
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  useEffect(() => {
    const stored = (localStorage.getItem(THEME_STORAGE_KEY) as ThemePreference | null) ?? "system";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount sonrası localStorage'dan tek seferlik senkronizasyon
    setPreferenceState(stored);
    setResolved(resolveTheme(stored));
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolved);
  }, [resolved]);

  useEffect(() => {
    if (preference !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setResolved(mq.matches ? "dark" : "light");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [preference]);

  const setPreference = useCallback((pref: ThemePreference) => {
    setPreferenceState(pref);
    localStorage.setItem(THEME_STORAGE_KEY, pref);
    setResolved(resolveTheme(pref));
  }, []);

  return (
    <ThemeContext.Provider value={{ preference, resolved, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme, ThemeProvider içinde kullanılmalı");
  return ctx;
}
