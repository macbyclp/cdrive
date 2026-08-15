"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { MeUser } from "@/lib/types";
import { formatBytesStr } from "@/lib/format";

export default function TopBar({
  user,
  onSearch,
}: {
  user: MeUser;
  onSearch?: (q: string) => void;
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
    <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-slate-200 bg-white px-5 py-3">
      <a href="/drive" className="flex items-center gap-2 shrink-0">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-sm font-semibold text-white">
          C
        </div>
        <span className="text-base font-semibold text-slate-900">Cdrive</span>
      </a>

      {onSearch && (
        <form
          className="flex-1 max-w-lg"
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

      <div className="ml-auto flex items-center gap-4">
        <div className="hidden sm:block w-40">
          <div className="flex justify-between text-[11px] text-slate-500 mb-1">
            <span>{formatBytesStr(user.usedBytes)}</span>
            <span>/ {formatBytesStr(user.quotaBytes)}</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-200">
            <div
              className={`h-1.5 rounded-full ${usedPct > 90 ? "bg-red-500" : "bg-slate-900"}`}
              style={{ width: `${usedPct}%` }}
            />
          </div>
        </div>

        {(user.role === "ADMIN" || user.role === "MANAGER") && (
          <a href="/admin" className="btn-secondary text-sm">
            Yönetim
          </a>
        )}

        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
            {user.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="hidden md:block text-sm">
            <div className="font-medium text-slate-900 leading-tight">{user.name}</div>
            <div className="text-xs text-slate-500 leading-tight">{user.role}</div>
          </div>
        </div>
        <button onClick={logout} className="btn-ghost">
          Çıkış
        </button>
      </div>
    </header>
  );
}
