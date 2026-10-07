"use client";

import { useState } from "react";
import type { MeUser } from "@/lib/types";
import TopBar from "@/components/TopBar";
import AppSidebar, { type AppSidebarActive } from "@/components/AppSidebar";
import Footer from "@/components/Footer";
import MobileTabBar from "@/components/MobileTabBar";
import ClaudePanel from "@/components/ClaudePanel";
import { isGlassSkin, visualSkin } from "@/lib/skin";

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
  // Artık görünüm, kullanıcının uiSkin'inden türetiliyor (bkz. src/lib/skin.ts); bu prop
  // yalnızca eski çağıranlarla uyumluluk için kabul ediliyor ve yok sayılıyor.
  dataSkin?: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [claudeOpen, setClaudeOpen] = useState(false);
  void dataSkin;
  const glass = isGlassSkin(user.uiSkin);

  return (
    <div
      className={glass ? "lg-glass-root flex min-h-screen flex-col" : "flex min-h-screen flex-col"}
      data-skin={visualSkin(user.uiSkin)}
      style={glass ? undefined : { backgroundColor: "var(--background)" }}
    >
      <TopBar user={user} onSearch={onSearch} hideQuickNav onMenuClick={() => setMenuOpen(true)} />
      <div className={glass ? "flex flex-1 gap-3 px-3 pt-3 sm:pl-3" : "flex flex-1"}>
        <AppSidebar
          user={user}
          active={active}
          mobileOpen={menuOpen}
          onMobileClose={() => setMenuOpen(false)}
          onClaude={() => setClaudeOpen(true)}
        />
        <main className={glass ? "lg-main min-w-0 flex-1 pt-1 sm:pt-2" : "flex-1 p-4 sm:p-6"}>{children}</main>
      </div>
      <Footer />
      {claudeOpen && <ClaudePanel userId={user.id} onClose={() => setClaudeOpen(false)} />}
      {glass && <MobileTabBar user={user} active={active} onMenu={() => setMenuOpen(true)} />}
    </div>
  );
}
