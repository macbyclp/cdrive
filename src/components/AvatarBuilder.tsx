"use client";

import { useState } from "react";
import AvatarFace from "@/components/AvatarFace";
import {
  type AvatarConfig,
  SKIN_TONES,
  HAIR_STYLES,
  HAIR_COLORS,
  EYE_STYLES,
  MOUTH_STYLES,
  ACCESSORIES,
} from "@/lib/avatar-parts";

type Category = "skin" | "hairStyle" | "hairColor" | "eyes" | "mouth" | "accessory";

const TABS: { key: Category; label: string; icon: string }[] = [
  { key: "skin", label: "Cilt", icon: "🎨" },
  { key: "hairStyle", label: "Saç", icon: "💇" },
  { key: "hairColor", label: "Saç rengi", icon: "🖌️" },
  { key: "eyes", label: "Göz", icon: "👀" },
  { key: "mouth", label: "Ağız", icon: "👄" },
  { key: "accessory", label: "Aksesuar", icon: "🕶️" },
];

/** Çok parçalı "memoji" tarzı avatar oluşturucu — canlı önizleme + kategori sekmeleri. */
export default function AvatarBuilder({
  value,
  onChange,
}: {
  value: AvatarConfig;
  onChange: (next: AvatarConfig) => void;
}) {
  const [tab, setTab] = useState<Category>("skin");

  function set<K extends Category>(key: K, v: string) {
    onChange({ ...value, [key]: v });
  }

  return (
    <div>
      <div className="mb-4 flex justify-center">
        <div
          className="rounded-full border p-1"
          style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}
        >
          <AvatarFace config={value} size={96} />
        </div>
      </div>

      <div className="mb-3 flex flex-wrap justify-center gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className="rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors"
            style={
              tab === t.key
                ? { background: "var(--accent-soft)", color: "var(--accent-soft-foreground)" }
                : { color: "var(--text-secondary)" }
            }
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {tab === "skin" &&
          SKIN_TONES.map((s) => (
            <SwatchButton key={s.key} active={value.skin === s.key} color={s.color} onClick={() => set("skin", s.key)} />
          ))}
        {tab === "hairColor" &&
          HAIR_COLORS.map((h) => (
            <SwatchButton
              key={h.key}
              active={value.hairColor === h.key}
              color={h.color}
              onClick={() => set("hairColor", h.key)}
            />
          ))}
        {tab === "hairStyle" &&
          HAIR_STYLES.map((h) => (
            <LabelButton
              key={h.key}
              active={value.hairStyle === h.key}
              label={h.label}
              onClick={() => set("hairStyle", h.key)}
            />
          ))}
        {tab === "eyes" &&
          EYE_STYLES.map((e) => (
            <LabelButton key={e.key} active={value.eyes === e.key} label={e.label} onClick={() => set("eyes", e.key)} />
          ))}
        {tab === "mouth" &&
          MOUTH_STYLES.map((m) => (
            <LabelButton
              key={m.key}
              active={value.mouth === m.key}
              label={m.label}
              onClick={() => set("mouth", m.key)}
            />
          ))}
        {tab === "accessory" &&
          ACCESSORIES.map((a) => (
            <LabelButton
              key={a.key}
              active={value.accessory === a.key}
              label={a.label}
              onClick={() => set("accessory", a.key)}
            />
          ))}
      </div>
    </div>
  );
}

function SwatchButton({ active, color, onClick }: { active: boolean; color: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-9 w-9 rounded-full transition-transform"
      style={{
        background: color,
        outline: active ? "3px solid var(--accent)" : "1px solid var(--border)",
        outlineOffset: "2px",
        transform: active ? "scale(1.08)" : "none",
      }}
      aria-label={color}
    />
  );
}

function LabelButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
      style={
        active
          ? { borderColor: "var(--accent)", background: "var(--accent-soft)", color: "var(--accent-soft-foreground)" }
          : { borderColor: "var(--border)", color: "var(--text-primary)" }
      }
    >
      {label}
    </button>
  );
}
