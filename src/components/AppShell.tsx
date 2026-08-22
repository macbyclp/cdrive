"use client";

import { useState } from "react";
import type { MeUser } from "@/lib/types";
import TopBar from "@/components/TopBar";
import AppSidebar, { type AppSidebarActive } from "@/components/AppSidebar";
import Footer from "@/components/Footer";

/**
 * "Panel" arayüzünün ortak sayfa iskeleti — TopBar + sol kenar çubuğu + içerik.
 * Genel Bakış, Satış, Muhasebe, Yönetim ve Müşteriler sayfalarının hepsi bunu kullanır,
 * böylece hepsi aynı gezinme/tasarım dilini paylaşır. Kenar çubuğu zaten Satış/Muhasebe/
 * Yönetim linklerini içerdiği için TopBar'daki eski üst-menü kısayolları burada
 * gizleniyor (hideQuickNav) — tekrar etmesin diye. /drive kendi düzenini kullanmaya
 * devam ediyor (bu kabuğa dahil değil, kendi sidebar'ı var).
 *
 * Mobil gezinme: kenar çubuğu <640px'te gizlendiği ve TopBar'ın kısayolları da mobilde
 * gizli olduğu için telefonda bu sayfalarda hiçbir gezinme öğesi kalmıyordu. TopBar'ın
 * ☰ düğmesi (onMenuClick) zaten yazılmıştı ama hiçbir yerden bağlanmamıştı — burada
 * kenar çubuğunun mobil çekmecesine bağlanıyor.
 */
export default function AppShell({
  user,
  active,
  children,
  onSearch,
  dataSkin,
}: {
  user: MeUser;
  active: AppSidebarActive;
  children: React.ReactNode;
  onSearch?: (q: string) => void;
  // /drive'ın "Kurumsal Arşiv" temasını (uiSkin==="archive") CSS'e taşımak için —
  // bkz. src/app/drive/page.tsx. Diğer sayfalar bu prop'u hiç vermez.
  dataSkin?: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col" data-skin={dataSkin} style={{ backgroundColor: "var(--background)" }}>
      <TopBar user={user} onSearch={onSearch} hideQuickNav onMenuClick={() => setMenuOpen(true)} />
      <div className="flex flex-1">
        <AppSidebar
          user={user}
          active={active}
          mobileOpen={menuOpen}
          onMobileClose={() => setMenuOpen(false)}
        />
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
      <Footer />
    </div>
  );
}
