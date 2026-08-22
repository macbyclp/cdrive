"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { useMe } from "@/lib/useMe";
import { formatCurrencyTL } from "@/lib/format";
import { remainingFrom } from "@/lib/orders";
import { withBasePath } from "@/lib/basePath";

type Customer = {
  id: string;
  name: string;
  contact: string | null;
  address: string | null;
  taxNumber: string | null;
  taxOffice: string | null;
  phone: string | null;
  email: string | null;
  orderCount: number;
  revenue: number;
  collected: number;
};

export default function CustomersPage() {
  const { user, refresh: refreshMe } = useMe();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  useEffect(() => {
    fetch(withBasePath("/api/customers"))
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Yüklenemedi");
        setCustomers(d);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Yüklenemedi"))
      .finally(() => setLoading(false));
  }, []);

  if (!user) return null;

  const canAccess = user.role === "ADMIN" || user.canCreateOrders || user.canManageOrders;
  if (!canAccess) {
    return (
      <AppShell user={user} active="customers">
        <div className="mx-auto max-w-2xl p-6 text-center">
          <p className="mt-10 text-sm" style={{ color: "var(--text-secondary)" }}>
            Bu bölüme erişiminiz yok.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell user={user} active="customers">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
              Müşteriler
            </h1>
            <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
              Sipariş açtığınız müşterilerin toplu özeti — bir satıra tıklayınca o müşterinin siparişlerini görürsün.
            </p>
          </div>
          <a href={withBasePath("/orders")} className="btn-secondary text-sm">
            Siparişlere dön
          </a>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        {loading && !error && (
          <div className="card overflow-hidden">
            {[0, 1, 2].map((i) => (
              <div key={i} className="border-b px-4 py-3 last:border-0" style={{ borderColor: "var(--border)" }}>
                <div className="skeleton h-4 w-1/2" />
              </div>
            ))}
          </div>
        )}

        {!loading && !error && customers.length === 0 && (
          <div className="card p-8 text-center">
            <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
              Henüz sipariş açılmış bir müşteri yok.
            </p>
          </div>
        )}

        {!loading && !error && customers.length > 0 && (
          <div className="card overflow-hidden">
            {customers.map((c) => {
              const remaining = remainingFrom(c.revenue, c.collected);
              return (
                <a
                  key={c.id}
                  href={withBasePath(`/orders?customerId=${c.id}`)}
                  className="flex w-full flex-wrap items-center gap-3 border-b px-4 py-3 text-left last:border-0 hover:opacity-90"
                  style={{ borderColor: "var(--border)" }}
                >
                  <div className="min-w-[10rem] flex-1">
                    <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      {c.name}
                    </div>
                    {c.contact && (
                      <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                        {c.contact}
                      </div>
                    )}
                    {(c.address || c.taxNumber || c.taxOffice || c.phone || c.email) && (
                      <div className="mt-0.5 text-xs" style={{ color: "var(--text-tertiary)" }} title="Faturadan otomatik çekildi">
                        {[
                          c.address,
                          c.taxNumber && `VKN ${c.taxNumber}`,
                          c.taxOffice,
                          c.phone,
                          c.email,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    )}
                  </div>
                  <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                    {c.orderCount} sipariş
                  </span>
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {formatCurrencyTL(c.revenue)}
                  </span>
                  <span className="text-xs" style={{ color: remaining > 0 ? "var(--warning, #d97706)" : "var(--success, #16a34a)" }}>
                    {remaining > 0 ? `Kalan ${formatCurrencyTL(remaining)}` : "Tamamı tahsil edildi"}
                  </span>
                </a>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
