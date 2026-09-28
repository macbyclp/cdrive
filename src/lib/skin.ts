import type { MeUser } from "@/lib/types";

/** "glass" ve "panel" Liquid Glass görünümünü kullanır; "modern" ve "archive" eski, düz görünümlerdir. */
export function isGlassSkin(skin: MeUser["uiSkin"] | undefined): boolean {
  return skin !== "modern" && skin !== "archive";
}

/** AppShell sarmalayıcısına yazılan data-skin değeri (CSS jetonlarını seçer). */
export function visualSkin(skin: MeUser["uiSkin"] | undefined): "glass" | "modern" | "archive" {
  return skin === "modern" ? "modern" : skin === "archive" ? "archive" : "glass";
}
