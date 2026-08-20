"use client";

import type { MeUser } from "@/lib/types";
import { withBasePath } from "@/lib/basePath";

export type AppSidebarActive = "panel" | "drive" | "sales" | "accounting" | "production" | "customers" | "admin" | "account";

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
 * "Panel" (uiSkin=panel) arayüzünün ortak kenar çubuğu — Genel Bakış, Satış, Muhasebe,
 * Yönetim, Müşteriler ve Hesap Ayarları sayfalarında AYNI yerde, aynı görünümde gösterilir
 * (bkz. AppShell). /drive kendi (dosya gezinme amaçlı) sidebar'ını kullanmaya devam eder —
 * burası ona dokunmaz.
 */
export default function AppSidebar({ user, active }: { user: MeUser; active: AppSidebarActive }) {
  const canOrders = user.role === "ADMIN" || user.canCreateOrders || user.canManageOrders;
  const canProduction = user.role === "ADMIN" || user.canManageProduction;
  const canAdmin = user.role === "ADMIN" || user.role === "MANAGER";

  return (
    <aside
      className="hidden w-60 shrink-0 border-r p-4 sm:block"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <nav className="space-y-1">
        <SideLink href="/panel" label="Genel Bakış" icon="📊" active={active === "panel"} />
        {/* ?view=root: /drive'ın "panel aktifken parametresiz kök = /panel'e geri yönlendir"
            mantığını burada bilerek atlatır, yoksa bu link kendi kendine geri döner. */}
        <SideLink href="/drive?view=root" label="Sürücüm" icon="🗂️" active={active === "drive"} />
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
    </aside>
  );
}
