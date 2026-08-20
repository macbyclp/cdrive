"use client";

import { useState } from "react";
import type { MeUser } from "@/lib/types";
import { withBasePath } from "@/lib/basePath";

/**
 * Admin bir kullanıcıyı taklit ederken (bkz. src/lib/auth.ts startImpersonation) TÜM
 * korumalı sayfalarda görünen sabit uyarı şeridi — TopBar'a gömülü, unutmayı imkansız
 * kılmak için kasıtlı olarak göze batan bir renk kullanıyor.
 */
export default function ImpersonationBanner({ user }: { user: MeUser }) {
  const [busy, setBusy] = useState(false);
  if (!user.impersonatedBy) return null;

  async function stop() {
    setBusy(true);
    await fetch(withBasePath("/api/account/stop-impersonation"), { method: "POST" }).catch(() => {});
    window.location.href = withBasePath("/admin");
  }

  return (
    <div
      className="flex items-center justify-center gap-3 px-4 py-2 text-sm font-medium text-white"
      style={{ background: "var(--warning, #d97706)" }}
    >
      <span>
        🕵️ Şu an <strong>{user.name}</strong> olarak görüntülüyorsun ({user.impersonatedBy} tarafından)
      </span>
      <button
        disabled={busy}
        onClick={stop}
        className="rounded-md bg-white/20 px-2.5 py-1 text-xs font-semibold hover:bg-white/30"
      >
        {busy ? "Dönülüyor…" : "Yönetime dön"}
      </button>
    </div>
  );
}
