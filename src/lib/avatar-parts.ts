// Çok parçalı, Memoji tarzı özelleştirilebilir avatar sistemi — Apple'ın kendi
// görsellerini kopyalamadan (telif + pratik olarak imkansız), tamamen kendi
// çizdiğimiz basit SVG şekillerden (bkz. AvatarFace bileşeni) katman katman
// bir yüz kuruyor. Bu dosya sadece SEÇENEK METADATASINI (id, etiket, önizleme
// rengi) tutar — gerçek çizim mantığı src/components/AvatarFace.tsx'te.
//
// 6 cilt tonu × 8 saç stili × 6 saç rengi × 6 göz × 5 ağız × 5 aksesuar
// = binlerce benzersiz kombinasyon.

export type AvatarConfig = {
  skin: string;
  hairStyle: string;
  hairColor: string;
  eyes: string;
  mouth: string;
  accessory: string;
};

export const SKIN_TONES = [
  { key: "s1", color: "#ffe0bd" },
  { key: "s2", color: "#ffcd94" },
  { key: "s3", color: "#eac086" },
  { key: "s4", color: "#c68642" },
  { key: "s5", color: "#8d5524" },
  { key: "s6", color: "#5c3a21" },
] as const;

export const HAIR_STYLES = [
  { key: "bald", label: "Kel" },
  { key: "short", label: "Kısa" },
  { key: "buzz", label: "Fırça" },
  { key: "curly", label: "Kıvırcık" },
  { key: "long", label: "Uzun" },
  { key: "bun", label: "Topuz" },
  { key: "mohawk", label: "Mohawk" },
  { key: "bangs", label: "Kahküllü" },
] as const;

export const HAIR_COLORS = [
  { key: "h1", color: "#1c1109" },
  { key: "h2", color: "#4a2c17" },
  { key: "h3", color: "#8b5a2b" },
  { key: "h4", color: "#c9a15a" },
  { key: "h5", color: "#e8d5b0" },
  { key: "h6", color: "#b33939" },
] as const;

export const EYE_STYLES = [
  { key: "normal", label: "Normal" },
  { key: "round", label: "Yuvarlak" },
  { key: "narrow", label: "Çekik" },
  { key: "wink", label: "Kırpık" },
  { key: "happy", label: "Kıvrık (mutlu)" },
  { key: "sleepy", label: "Uykulu" },
] as const;

export const MOUTH_STYLES = [
  { key: "smile", label: "Gülümseme" },
  { key: "grin", label: "Sırıtış" },
  { key: "neutral", label: "Düz" },
  { key: "open", label: "Açık ağız" },
  { key: "smirk", label: "Yarım gülümseme" },
] as const;

export const ACCESSORIES = [
  { key: "none", label: "Yok" },
  { key: "glasses", label: "Gözlük" },
  { key: "sunglasses", label: "Güneş gözlüğü" },
  { key: "headband", label: "Bandana" },
  { key: "earrings", label: "Küpe" },
] as const;

export const DEFAULT_AVATAR_CONFIG: AvatarConfig = {
  skin: "s2",
  hairStyle: "short",
  hairColor: "h1",
  eyes: "normal",
  mouth: "smile",
  accessory: "none",
};

export function serializeAvatarConfig(config: AvatarConfig): string {
  return JSON.stringify(config);
}

export function parseAvatarConfig(raw: string | null | undefined): AvatarConfig | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.skin === "string" &&
      typeof parsed?.hairStyle === "string" &&
      typeof parsed?.hairColor === "string" &&
      typeof parsed?.eyes === "string" &&
      typeof parsed?.mouth === "string" &&
      typeof parsed?.accessory === "string"
    ) {
      return parsed as AvatarConfig;
    }
    return null;
  } catch {
    return null;
  }
}

export function skinColor(key: string): string {
  return SKIN_TONES.find((s) => s.key === key)?.color ?? SKIN_TONES[0].color;
}
export function hairColorValue(key: string): string {
  return HAIR_COLORS.find((h) => h.key === key)?.color ?? HAIR_COLORS[0].color;
}
