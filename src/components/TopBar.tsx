"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { MeUser } from "@/lib/types";
import { formatBytesStr } from "@/lib/format";
import ThemeToggle from "@/components/ThemeToggle";

const AVATAR_COLORS = [
  "#0f172a", "#7c3aed", "#0891b2", "#c2410c", "#15803d", "#be185d", "#4338ca",
];

function avatarColor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export default function TopBar({
  user,
  onSearch,
  onMenuClick,
}: {
  user: MeUser;
  onSearch?: (q: string) => void;
  onMenuClick?: () => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const usedPct = Math.min(
    100,
    Math.round((Number(user.usedBytes) / Math.max(Number(user.quotaBytes), 1)) * 100)
  );

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header
      className="sticky top-0 z-10 flex items-center gap-3 border-b px-4 py-3 sm:gap-4 sm:px-5"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      {onMenuClick && (
        <button onClick={onMenuClick} className="btn-ghost shrink-0 sm:hidden" aria-label="Menü">
          ☰
        </button>
      )}

      <a href="/drive" className="flex shrink-0 items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-sm font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
          C
        </div>
        <span className="hidden text-base font-semibold sm:inline" style={{ color: "var(--text-primary)" }}>
          Cdrive
        </span>
      </a>

      {onSearch && (
        <form
          className="max-w-lg flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            onSearch(q);
          }}
        >
          <input
            className="input"
            placeholder="Dosya ara…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </form>
      )}

      <div className="ml-auto flex items-center gap-2 sm:gap-4">
        <div className="hidden w-40 md:block">
          <div className="mb-1 flex justify-between text-[11px]" style={{ color: "var(--text-secondary)" }}>
            <span>{formatBytesStr(user.usedBytes)}</span>
            <span>/ {formatBytesStr(user.quotaBytes)}</span>
          </div>
          <div className="h-1.5 w-full rounded-full" style={{ background: "var(--surface-muted)" }}>
            <div
              className={`h-1.5 rounded-full ${usedPct > 90 ? "bg-red-500" : "bg-slate-900 dark:bg-slate-100"}`}
              style={{ width: `${usedPct}%` }}
            />
          </div>
        </div>

        {(user.role === "ADMIN" || user.role === "MANAGER") && (
          <a href="/admin" className="btn-secondary hidden text-sm sm:inline-block">
            Yönetim
          </a>
        )}

        <ThemeToggle />

        <div className="hidden items-center gap-2 sm:flex">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white"
            style={{ background: avatarColor(user.email) }}
          >
            {user.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="hidden text-sm md:block">
            <div className="font-medium leading-tight" style={{ color: "var(--text-primary)" }}>
              {user.name}
            </div>
            <div className="text-xs leading-tight" style={{ color: "var(--text-secondary)" }}>
              {user.role}
            </div>
          </div>
        </div>
        <button onClick={logout} className="btn-ghost">
          Çıkış
        </button>
      </div>
    </header>
  );
}
