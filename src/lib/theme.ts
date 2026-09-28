export type ThemePreference = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "cdrive-theme";
/** "on" | "off" | "system" (prefers-reduced-motion'ı izle). Kayıt yoksa varsayılan "on": su efekti Liquid Glass'ın imzasıdır. */
export const MOTION_STORAGE_KEY = "cdrive-motion";

export type MotionPreference = "system" | "on" | "off";

export function resolveMotion(pref: MotionPreference): "on" | "off" {
  if (pref === "on" || pref === "off") return pref;
  if (typeof window === "undefined") return "on";
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "off" : "on";
}

export function resolveTheme(pref: ThemePreference): "light" | "dark" {
  if (pref === "system") {
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return pref;
}

/** Sayfa boyanmadan önce <head> içinde çalışıp yanlış temayla çizilmeyi (FOUC) önler. */
export const themeInitScript = `
(function () {
  try {
    var pref = localStorage.getItem("${THEME_STORAGE_KEY}") || "system";
    var resolved = pref === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : pref;
    document.documentElement.setAttribute("data-theme", resolved);
    var m = localStorage.getItem("${MOTION_STORAGE_KEY}");
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.documentElement.setAttribute("data-motion", m === "off" ? "off" : (m === "system" && reduce ? "off" : "on"));
  } catch (e) {}
})();
`;
