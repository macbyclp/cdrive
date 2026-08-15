export type ThemePreference = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "cdrive-theme";

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
  } catch (e) {}
})();
`;
