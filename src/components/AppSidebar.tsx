"use client";

import { useEffect } from "react";
import type { MeUser } from "@/lib/types";
import { withBasePath } from "@/lib/basePath";

export type AppSidebarActive = "panel" | "drive" | "chat" | "sales" | "accounting" | "production" | "customers" | "admin" | "account";

function SideLink({ href, label, icon, active = false }: { href: string; label: string; icon: string; active?: boolean }) {
  return (
    <a
      href={withBasePath(href)}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors"
      style={
        active
          ? { background: "var(--accent-soft)", color: "var(--accent-soft-foreground)" }
          : { color: "var(--text-secondary)" }
      }
    >
      <span className="text-base">{icon}</span>
      {label}
    </a>
  );
}

/**
 * Kenar çubuğunun link listesi — masaüstü `<aside>`'ı ve mobil çekmece AYNI listeyi
 * kullansın diye ayrıldı (iki yerde ayrı ayrı tutulursa biri güncellenip diğeri
 * unutuluyor).
 */
function SidebarNav({ user, active }: { user: MeUser; active: AppSidebarActive }) {
  const canOrders = user.role === "ADMIN" || user.canCreateOrders || user.canManageOrders;
  const canProduction = user.role === "ADMIN" || user.canManageProduction;
  const canAdmin = user.role === "ADMIN" || user.role === "MANAGER";

  return (
    <nav className="space-y-1">
      <SideLink href="/panel" label="Genel Bakış" icon="📊" active={active === "panel"} />
      {/* ?view=root: /drive'ın "panel aktifken parametresiz kök = /panel'e geri yönlendir"
          mantığını burada bilerek atlatır, yoksa bu link kendi kendine geri döner. */}
      <SideLink href="/drive?view=root" label="Sürücüm" icon="🗂️" active={active === "drive"} />
      <SideLink href="/chat" label="Sohbet" icon="💬" active={active === "chat"} />
      {(user.role === "ADMIN" || user.canCreateOrders) && (
        <SideLink href="/orders" label="Satış" icon="🛒" active={active === "sales"} />
      )}
      {(user.role === "ADMIN" || user.canManageOrders) && (
        <SideLink href="/accounting" label="Muhasebe" icon="🧾" active={active === "accounting"} />
      )}
      {canProduction && <SideLink href="/production" label="Üretim" icon="🏭" active={active === "production"} />}
      {canOrders && <SideLink href="/customers" label="Müşteriler" icon="👥" active={active === "customers"} />}
      {canAdmin && <SideLink href="/admin" label="Yönetim" icon="⚙️" active={active === "admin"} />}
      <SideLink href="/account" label="Hesap Ayarları" icon="🙍" active={active === "account"} />
    </nav>
  );
}

/**
 * "Panel" (uiSkin=panel) arayüzünün ortak kenar çubuğu — Genel Bakış, Satış, Muhasebe,
 * Yönetim, Müşteriler ve Hesap Ayarları sayfalarında AYNI yerde, aynı görünümde gösterilir
 * (bkz. AppShell). /drive kendi (dosya gezinme amaçlı) sidebar'ını kullanmaya devam eder —
 * burası ona dokunmaz.
 *
 * Mobil (<640px): masaüstü `<aside>` gizlenir ve yerine TopBar'daki ☰ düğmesinin açtığı
 * bir çekmece gelir. Önceden çekmece YOKTU — sidebar sadece `hidden sm:block` ile
 * gizleniyordu ve TopBar'ın kısayolları da mobilde gizli olduğu için telefonda bu
 * sayfalara girince hiçbir gezinme öğesi kalmıyordu (bkz. `mobileOpen`/`onMobileClose`).
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
  // Çekmece açıkken Esc ile kapansın ve arkadaki sayfa kaymasın.
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

  return (
    <>
      {/* Masaüstü — sabit kenar çubuğu */}
      <aside
        className="hidden w-60 shrink-0 border-r p-4 sm:block"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <SidebarNav user={user} active={active} />
      </aside>

      {/* Mobil — çekmece. Kapalıyken hiç render edilmez ki arka planda odaklanabilir
          (focusable) gizli linkler kalmasın. */}
      {mobileOpen && (
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
            {/* Link'e tıklanınca çekmece kapansın — aynı sayfa içi geçişlerde açık
                kalmasın diye sarmalayıcıda yakalıyoruz. */}
            <div onClick={onMobileClose} className="flex-1 overflow-y-auto">
              <SidebarNav user={user} active={active} />
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
