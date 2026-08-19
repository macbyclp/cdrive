/**
 * Hazır "memoji" tarzı avatar seti — dış servise/görsel dosyaya ihtiyaç duymadan, karakter
 * emojisi + gradyan zemin kombinasyonuyla üretiliyor. İlk giriş kurulumunda (bkz. /onboarding)
 * ve avatarın göründüğü her yerde (TopBar, Panel, kullanıcı listesi) kullanılır.
 */
export type AvatarPreset = { key: string; emoji: string; from: string; to: string };

export const AVATAR_PRESETS: AvatarPreset[] = [
  { key: "fox", emoji: "🦊", from: "#f97316", to: "#fb923c" },
  { key: "panda", emoji: "🐼", from: "#1f2937", to: "#4b5563" },
  { key: "koala", emoji: "🐨", from: "#64748b", to: "#94a3b8" },
  { key: "owl", emoji: "🦉", from: "#78350f", to: "#b45309" },
  { key: "frog", emoji: "🐸", from: "#15803d", to: "#4ade80" },
  { key: "penguin", emoji: "🐧", from: "#0f172a", to: "#334155" },
  { key: "lion", emoji: "🦁", from: "#d97706", to: "#fbbf24" },
  { key: "tiger", emoji: "🐯", from: "#ea580c", to: "#f97316" },
  { key: "rabbit", emoji: "🐰", from: "#db2777", to: "#f472b6" },
  { key: "bear", emoji: "🐻", from: "#92400e", to: "#c2703d" },
  { key: "unicorn", emoji: "🦄", from: "#7c3aed", to: "#c084fc" },
  { key: "dragon", emoji: "🐲", from: "#065f46", to: "#10b981" },
  { key: "wolf", emoji: "🐺", from: "#374151", to: "#6b7280" },
  { key: "octopus", emoji: "🐙", from: "#be185d", to: "#ec4899" },
  { key: "robot", emoji: "🤖", from: "#0891b2", to: "#22d3ee" },
  { key: "alien", emoji: "👽", from: "#16a34a", to: "#4ade80" },
];

export function getAvatarPreset(key?: string | null): AvatarPreset | null {
  if (!key) return null;
  return AVATAR_PRESETS.find((a) => a.key === key) ?? null;
}
