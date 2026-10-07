"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { MeUser } from "@/lib/types";
import { withBasePath } from "@/lib/basePath";
import { isGlassSkin } from "@/lib/skin";
import NavIcon, { type NavIconName } from "@/components/NavIcons";

export type AppSidebarActive =
  | "panel"
  | "drive"
  | "chat"
  | "sales"
  | "accounting"
  | "production"
  | "customers"
  | "admin"
  | "reports"
  | "account";

type NavItem = { key: AppSidebarActive; href: string; label: string; icon: NavIconName; emoji: string };

/**
 * Kullanıcının rolüne/izinlerine göre görebildiği gezinme öğeleri — masaüstü kenar çubuğu,
 * mobil menü sayfası ve (eski görünümlerdeki) çekmece AYNI listeyi kullansın diye tek yerde.
 */
export function navItemsFor(user: MeUser): NavItem[] {
  const canOrders = user.role === "ADMIN" || user.canCreateOrders || user.canManageOrders;
  const canProduction = user.role === "ADMIN" || user.canManageProduction;
  const canAdmin = user.role === "ADMIN" || user.role === "MANAGER";
  const items: NavItem[] = [
    { key: "panel", href: "/panel", label: "Genel Bakış", icon: "panel", emoji: "📊" },
    // ?view=root: /drive'ın "panel aktifken parametresiz kök = /panel'e geri yönlendir"
    // mantığını burada bilerek atlatır, yoksa bu link kendi kendine geri döner.
    { key: "drive", href: "/drive?view=root", label: "Sürücüm", icon: "drive", emoji: "🗂️" },
    { key: "chat", href: "/chat", label: "Sohbet", icon: "chat", emoji: "💬" },
  ];
  if (user.role === "ADMIN" || user.canCreateOrders)
    items.push({ key: "sales", href: "/orders", label: "Satış", icon: "sales", emoji: "🛒" });
  if (user.role === "ADMIN" || user.canManageOrders)
    items.push({ key: "accounting", href: "/accounting", label: "Muhasebe", icon: "accounting", emoji: "🧾" });
  if (canProduction)
    items.push({ key: "production", href: "/production", label: "Üretim", icon: "production", emoji: "🏭" });
  if (canOrders)
    items.push({ key: "customers", href: "/customers", label: "Müşteriler", icon: "customers", emoji: "👥" });
  if (canAdmin) items.push({ key: "admin", href: "/admin", label: "Yönetim", icon: "admin", emoji: "⚙️" });
  // Rapor endpointleri ADMIN-only olduğu için link de sadece ADMIN'e görünür (MANAGER dahil değil).
  if (user.role === "ADMIN")
    items.push({ key: "reports", href: "/reports", label: "Raporlar", icon: "reports", emoji: "📊" });
  items.push({ key: "account", href: "/account", label: "Hesap Ayarları", icon: "account", emoji: "🙍" });
  return items;
}

function SideLink({ item, active, glass }: { item: NavItem; active: boolean; glass: boolean }) {
  if (glass) {
    return (
      <a
        href={withBasePath(item.href)}
        aria-current={active ? "page" : undefined}
        className="lg-nav-link flex items-center gap-3 px-3 py-2.5 text-sm font-medium"
        style={active ? undefined : { color: "var(--text-secondary)" }}
      >
        <NavIcon name={item.icon} />
        {item.label}
      </a>
    );
  }
  return (
    <a
      href={withBasePath(item.href)}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors"
      style={
        active
          ? { background: "var(--accent-soft)", color: "var(--accent-soft-foreground)" }
          : { color: "var(--text-secondary)" }
      }
    >
      <span className="text-base">{item.emoji}</span>
      {item.label}
    </a>
  );
}

function SidebarNav({ user, active, glass }: { user: MeUser; active: AppSidebarActive; glass: boolean }) {
  return (
    <nav className="space-y-1">
      {navItemsFor(user).map((item) => (
        <SideLink key={item.key} item={item} active={active === item.key} glass={glass} />
      ))}
    </nav>
  );
}

/**
 * Ortak kenar çubuğu — Genel Bakış, Satış, Muhasebe, Yönetim, Müşteriler ve Hesap Ayarları
 * sayfalarında AYNI yerde, aynı görünümde gösterilir (bkz. AppShell).
 *
 * Masaüstü: Liquid Glass'ta sayfadan ayrık, yüzen cam panel (sticky).
 * Mobil (<640px): Liquid Glass'ta alt sekme çubuğundaki "Menü" ile açılan, alttan kayan
 * iOS tarzı sayfa (bottom sheet) — ızgara halinde tüm bölümler + çıkış. Eski görünümlerde
 * (modern/archive) klasik sol çekmece.
 */
export default function AppSidebar({
  user,
  active,
  mobileOpen = false,
  onMobileClose,
}: {
  user: MeUser;
  active: AppSidebarActive;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}) {
  const glass = isGlassSkin(user.uiSkin);
  const router = useRouter();

  // Menü açıkken Esc ile kapansın ve arkadaki sayfa kaymasın.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onMobileClose?.();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [mobileOpen, onMobileClose]);

  async function logout() {
    await fetch(withBasePath("/api/auth/logout"), { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      {/* Masaüstü — sabit kenar çubuğu */}
      {glass ? (
        <aside className="lg-shell-side sticky top-[5.25rem] hidden max-h-[calc(100dvh-6.25rem)] w-60 shrink-0 self-start overflow-y-auto p-3 sm:block">
          <SidebarNav user={user} active={active} glass />
        </aside>
      ) : (
        <aside
          className="hidden w-60 shrink-0 border-r p-4 sm:block"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <SidebarNav user={user} active={active} glass={false} />
        </aside>
      )}

      {/* Mobil menü. Kapalıyken hiç render edilmez ki arka planda odaklanabilir gizli linkler kalmasın. */}
      {mobileOpen && glass && (
        <div className="fixed inset-0 z-40 sm:hidden">
          <button
            aria-label="Menüyü kapat"
            onClick={onMobileClose}
            className="dialog-overlay absolute inset-0 h-full w-full"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Gezinme menüsü"
            className="dialog-panel absolute inset-x-0 bottom-0 !rounded-b-none p-5"
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
                Menü
              </span>
              <button onClick={onMobileClose} className="btn-ghost" aria-label="Menüyü kapat">
                Kapat
              </button>
            </div>
            <div onClick={onMobileClose} className="grid grid-cols-3 gap-2.5">
              {navItemsFor(user).map((item) => (
                <a
                  key={item.key}
                  href={withBasePath(item.href)}
                  aria-current={active === item.key ? "page" : undefined}
                  className="lg-nav-link flex flex-col items-center gap-1.5 px-2 py-3 text-center text-xs font-medium"
                  style={{
                    color: active === item.key ? "var(--text-primary)" : "var(--text-secondary)",
                    background: active === item.key ? undefined : "var(--surface-muted)",
                  }}
                >
                  <NavIcon name={item.icon} size={24} />
                  {item.label}
                </a>
              ))}
            </div>
            <button onClick={logout} className="btn-secondary mt-4 flex w-full items-center justify-center gap-2">
              <NavIcon name="logout" size={18} />
              Çıkış
            </button>
          </div>
        </div>
      )}

      {mobileOpen && !glass && (
        <div className="fixed inset-0 z-40 sm:hidden">
          <button
            aria-label="Menüyü kapat"
            onClick={onMobileClose}
            className="absolute inset-0 h-full w-full"
            style={{ background: "rgba(0,0,0,0.45)" }}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Gezinme menüsü"
            className="absolute left-0 top-0 flex h-full w-64 flex-col border-r p-4 shadow-xl"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                Menü
              </span>
              <button onClick={onMobileClose} className="btn-ghost" aria-label="Menüyü kapat">
                <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden="true">
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
            {/* Link'e tıklanınca çekmece kapansın — aynı sayfa içi geçişlerde açık kalmasın. */}
            <div onClick={onMobileClose} className="flex-1 overflow-y-auto">
              <SidebarNav user={user} active={active} glass={false} />
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
