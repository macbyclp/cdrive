"use client";

import type { MeUser } from "@/lib/types";
import TopBar from "@/components/TopBar";
import AppSidebar, { type AppSidebarActive } from "@/components/AppSidebar";

/**
 * "Panel" arayüzünün ortak sayfa iskeleti — TopBar + sol kenar çubuğu + içerik.
 * Genel Bakış, Satış, Muhasebe, Yönetim ve Müşteriler sayfalarının hepsi bunu kullanır,
 * böylece hepsi aynı gezinme/tasarım dilini paylaşır. Kenar çubuğu zaten Satış/Muhasebe/
 * Yönetim linklerini içerdiği için TopBar'daki eski üst-menü kısayolları burada
 * gizleniyor (hideQuickNav) — tekrar etmesin diye. /drive kendi düzenini kullanmaya
 * devam ediyor (bu kabuğa dahil değil, kendi sidebar'ı var).
 */
export default function AppShell({
  user,
  active,
  children,
  onSearch,
}: {
  user: MeUser;
  active: AppSidebarActive;
  children: React.ReactNode;
  onSearch?: (q: string) => void;
}) {
  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: "var(--background)" }}>
      <TopBar user={user} onSearch={onSearch} hideQuickNav />
      <div className="flex flex-1">
        <AppSidebar user={user} active={active} />
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
