import type { ReactNode } from "react";

export type NavIconName =
  | "panel"
  | "drive"
  | "chat"
  | "sales"
  | "accounting"
  | "production"
  | "customers"
  | "admin"
  | "reports"
  | "account"
  | "menu"
  | "logout"
  | "clock"
  | "star"
  | "film"
  | "share"
  | "trash";

// Tek renkli (currentColor) çizgi ikonlar — iOS'un SF Symbols diliyle uyumlu, nötr Liquid Glass paletine oturur.
const PATHS: Record<NavIconName, ReactNode> = {
  panel: (
    <>
      <rect x="3" y="3" width="8" height="8" rx="2.2" />
      <rect x="13" y="3" width="8" height="5" rx="2.2" />
      <rect x="13" y="10" width="8" height="11" rx="2.2" />
      <rect x="3" y="13" width="8" height="8" rx="2.2" />
    </>
  ),
  drive: <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2.2h7.5A2.5 2.5 0 0 1 21 9.7v8.8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18.5z" />,
  chat: <path d="M20.5 12a8.5 8.5 0 0 1-12.3 7.6L3.5 20.5l1-4.4A8.5 8.5 0 1 1 20.5 12z" />,
  sales: (
    <>
      <path d="M3 4h2.2l2.3 10.6a2 2 0 0 0 2 1.6h7.4a2 2 0 0 0 1.9-1.4L20.5 8H6.2" />
      <circle cx="10" cy="20" r="1.2" />
      <circle cx="17" cy="20" r="1.2" />
    </>
  ),
  accounting: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <path d="M9 8h6M9 12h6" />
    </>
  ),
  production: (
    <>
      <path d="M21 8l-9-5-9 5 9 5z" />
      <path d="M3 8v8l9 5 9-5V8M12 13v8" />
    </>
  ),
  customers: (
    <>
      <path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20" />
      <circle cx="10" cy="8.5" r="3.5" />
      <path d="M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 5.2a3.5 3.5 0 0 1 0 6.6" />
    </>
  ),
  admin: (
    <>
      <path d="M4 6h9M19 6h1M4 12h3M13 12h7M4 18h11M21 18h-1" />
      <circle cx="16" cy="6" r="2.2" />
      <circle cx="10" cy="12" r="2.2" />
      <circle cx="18" cy="18" r="2.2" />
    </>
  ),
  reports: <path d="M4 20V11M10 20V4M16 20v-7M2.5 20h19" />,
  account: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  logout: <path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3M16 8l4 4-4 4M20 12H9" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  star: <path d="M12 3.5l2.6 5.3 5.9.85-4.25 4.15 1 5.85L12 16.9l-5.25 2.75 1-5.85L3.5 9.65l5.9-.85z" />,
  film: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M10 9.2v5.6l4.8-2.8z" />
    </>
  ),
  share: (
    <>
      <circle cx="6" cy="12" r="2.6" />
      <circle cx="18" cy="6" r="2.6" />
      <circle cx="18" cy="18" r="2.6" />
      <path d="M8.3 10.8l7.4-3.6M8.3 13.2l7.4 3.6" />
    </>
  ),
  trash: <path d="M4 7h16M9 7V4.5h6V7M6.5 7l.8 12.2a1.5 1.5 0 0 0 1.5 1.3h6.4a1.5 1.5 0 0 0 1.5-1.3L17.5 7M10 11v6M14 11v6" />,
};

export default function NavIcon({ name, size = 20 }: { name: NavIconName; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
