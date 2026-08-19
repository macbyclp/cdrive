"use client";

import { getAvatarPreset } from "@/lib/avatars";

const INITIAL_COLORS = ["#0f172a", "#7c3aed", "#0891b2", "#c2410c", "#15803d", "#be185d", "#4338ca"];
function initialColor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return INITIAL_COLORS[hash % INITIAL_COLORS.length];
}

/** Kullanıcının seçtiği memoji avatarını, yoksa baş harfli renkli rozeti gösterir. */
export default function Avatar({
  name,
  email,
  avatarKey,
  size = 32,
}: {
  name: string;
  email: string;
  avatarKey?: string | null;
  size?: number;
}) {
  const preset = getAvatarPreset(avatarKey);
  const fontSize = Math.round(size * 0.55);

  if (preset) {
    return (
      <div
        className="flex shrink-0 items-center justify-center rounded-full"
        style={{
          width: size,
          height: size,
          background: `linear-gradient(135deg, ${preset.from}, ${preset.to})`,
          fontSize,
        }}
        title={name}
      >
        {preset.emoji}
      </div>
    );
  }

  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: initialColor(email), fontSize: fontSize * 0.7 }}
      title={name}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}
