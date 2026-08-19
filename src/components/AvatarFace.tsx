"use client";

import type { AvatarConfig } from "@/lib/avatar-parts";
import { skinColor, hairColorValue } from "@/lib/avatar-parts";

/**
 * Çok parçalı "memoji" tarzı avatarın gerçek çizimi — tamamen kendi çizdiğimiz
 * basit SVG şekillerinden, hiçbir dış görsel/asset kullanmıyor. `config`'teki
 * her kategori (cilt/saç/göz/ağız/aksesuar) bağımsız olarak katmanlanır.
 */
export default function AvatarFace({ config, size = 96 }: { config: AvatarConfig; size?: number }) {
  const skin = skinColor(config.skin);
  const hair = hairColorValue(config.hairColor);

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="Avatar">
      {/* Kulaklar */}
      <circle cx="16" cy="54" r="7" fill={skin} />
      <circle cx="84" cy="54" r="7" fill={skin} />

      {/* Yüz */}
      <circle cx="50" cy="52" r="32" fill={skin} />

      {/* Saç (yüzün arkasında/üstünde stile göre) */}
      <Hair style={config.hairStyle} color={hair} />

      {/* Gözler */}
      <Eyes style={config.eyes} />

      {/* Ağız */}
      <Mouth style={config.mouth} />

      {/* Aksesuar */}
      <Accessory kind={config.accessory} hair={hair} />
    </svg>
  );
}

function Hair({ style, color }: { style: string; color: string }) {
  switch (style) {
    case "bald":
      return null;
    case "short":
      return <path d="M 18 40 Q 50 8 82 40 L 82 30 Q 50 14 18 30 Z" fill={color} />;
    case "buzz":
      return <path d="M 19 36 A 31 31 0 0 1 81 36 L 81 26 A 31 28 0 0 0 19 26 Z" fill={color} opacity="0.85" />;
    case "curly":
      return (
        <g fill={color}>
          <circle cx="24" cy="30" r="9" />
          <circle cx="36" cy="20" r="10" />
          <circle cx="50" cy="16" r="10" />
          <circle cx="64" cy="20" r="10" />
          <circle cx="76" cy="30" r="9" />
        </g>
      );
    case "long":
      return (
        <path
          d="M 17 42 Q 50 6 83 42 L 88 78 Q 82 82 80 72 L 76 44 Q 50 20 24 44 L 20 72 Q 18 82 12 78 Z"
          fill={color}
        />
      );
    case "bun":
      return (
        <g fill={color}>
          <path d="M 18 40 Q 50 10 82 40 L 82 28 Q 50 12 18 28 Z" />
          <circle cx="50" cy="10" r="8" />
        </g>
      );
    case "mohawk":
      return (
        <g fill={color}>
          <path d="M 44 8 L 56 8 L 53 34 L 47 34 Z" />
        </g>
      );
    case "bangs":
      return (
        <path
          d="M 18 38 Q 50 10 82 38 L 82 46 Q 66 34 50 46 Q 34 34 18 46 Z"
          fill={color}
        />
      );
    default:
      return null;
  }
}

function Eyes({ style }: { style: string }) {
  const common = "#20202a";
  switch (style) {
    case "round":
      return (
        <g fill={common}>
          <circle cx="38" cy="48" r="4.5" />
          <circle cx="62" cy="48" r="4.5" />
        </g>
      );
    case "narrow":
      return (
        <g stroke={common} strokeWidth="2.5" strokeLinecap="round">
          <path d="M 33 48 L 43 48" />
          <path d="M 57 48 L 67 48" />
        </g>
      );
    case "wink":
      return (
        <g>
          <circle cx="38" cy="48" r="3.5" fill={common} />
          <path d="M 58 48 L 66 48" stroke={common} strokeWidth="2.5" strokeLinecap="round" />
        </g>
      );
    case "happy":
      return (
        <g stroke={common} strokeWidth="2.5" strokeLinecap="round" fill="none">
          <path d="M 33 49 Q 38 44 43 49" />
          <path d="M 57 49 Q 62 44 67 49" />
        </g>
      );
    case "sleepy":
      return (
        <g stroke={common} strokeWidth="2" strokeLinecap="round">
          <path d="M 34 49 Q 38 51 43 49" />
          <path d="M 57 49 Q 62 51 66 49" />
        </g>
      );
    case "normal":
    default:
      return (
        <g fill={common}>
          <circle cx="38" cy="48" r="3.5" />
          <circle cx="62" cy="48" r="3.5" />
        </g>
      );
  }
}

function Mouth({ style }: { style: string }) {
  const common = "#7a2e2e";
  switch (style) {
    case "grin":
      return <path d="M 36 62 Q 50 74 64 62 Q 50 70 36 62 Z" fill="#fff" stroke={common} strokeWidth="1.5" />;
    case "neutral":
      return <path d="M 38 65 L 62 65" stroke={common} strokeWidth="2.5" strokeLinecap="round" />;
    case "open":
      return <ellipse cx="50" cy="66" rx="7" ry="6" fill="#5c2020" />;
    case "smirk":
      return <path d="M 40 64 Q 55 68 62 60" stroke={common} strokeWidth="2.5" strokeLinecap="round" fill="none" />;
    case "smile":
    default:
      return <path d="M 37 62 Q 50 72 63 62" stroke={common} strokeWidth="2.5" strokeLinecap="round" fill="none" />;
  }
}

function Accessory({ kind, hair }: { kind: string; hair: string }) {
  switch (kind) {
    case "glasses":
      return (
        <g stroke="#2a2a2a" strokeWidth="2" fill="none">
          <circle cx="38" cy="48" r="8" />
          <circle cx="62" cy="48" r="8" />
          <path d="M 46 48 L 54 48" />
        </g>
      );
    case "sunglasses":
      return (
        <g>
          <circle cx="38" cy="48" r="8" fill="#1a1a1a" />
          <circle cx="62" cy="48" r="8" fill="#1a1a1a" />
          <path d="M 46 48 L 54 48" stroke="#1a1a1a" strokeWidth="2" />
        </g>
      );
    case "headband":
      return <path d="M 18 34 Q 50 20 82 34 L 82 28 Q 50 14 18 28 Z" fill={hair === "#e8d5b0" ? "#7a2e2e" : "#e8d5b0"} />;
    case "earrings":
      return (
        <g fill="#d4af37">
          <circle cx="16" cy="61" r="2.5" />
          <circle cx="84" cy="61" r="2.5" />
        </g>
      );
    case "none":
    default:
      return null;
  }
}
