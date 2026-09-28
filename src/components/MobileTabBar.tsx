"use client";

import type { MeUser } from "@/lib/types";
import { withBasePath } from "@/lib/basePath";
import NavIcon, { type NavIconName } from "@/components/NavIcons";
import type { AppSidebarActive } from "@/components/AppSidebar";

const TABS: { key: AppSidebarActive; href: string; label: string; icon: NavIconName }[] = [
  { key: "panel", href: "/panel", label: "Genel Bakış", icon: "panel" },
  { key: "drive", href: "/drive?view=root", label: "Sürücüm", icon: "drive" },
  { key: "chat", href: "/chat", label: "Sohbet", icon: "chat" },
];

/**
 * iOS tarzı alt sekme çubuğu (yalnız telefonda, Liquid Glass görünümünde) — yüzen cam kapsül.
 * Üç ana bölüm + "Menü" (diğer tüm bölümler için alttan kayan sayfa). Ana bölümlerin dışındaki
 * bir sayfadaysak (örn. Muhasebe) "Menü" sekmesi seçili görünür.
 */
export default function MobileTabBar({
  active,
  onMenu,
}: {
  user: MeUser;
  active: AppSidebarActive;
  onMenu: () => void;
}) {
  const inMain = TABS.some((t) => t.key === active);
  return (
    <nav className="lg-tabbar" aria-label="Ana gezinme">
      {TABS.map((t) => (
        <a
          key={t.key}
          href={withBasePath(t.href)}
          aria-current={active === t.key ? "page" : undefined}
          className="lg-tab"
        >
          <span className="lg-tab-icon">
            <NavIcon name={t.icon} size={22} />
          </span>
          {t.label}
        </a>
      ))}
      <button type="button" onClick={onMenu} aria-current={inMain ? undefined : "page"} className="lg-tab">
        <span className="lg-tab-icon">
          <NavIcon name="menu" size={22} />
        </span>
        Menü
      </button>
    </nav>
  );
}
