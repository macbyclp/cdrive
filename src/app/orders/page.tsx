"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import OrderDialog from "@/components/OrderDialog";
import OrderDetailDialog from "@/components/OrderDetailDialog";
import { useMe } from "@/lib/useMe";
import { formatCurrencyTL, formatDate } from "@/lib/format";
import { withBasePath } from "@/lib/basePath";

type OrderRow = {
  id: string;
  customerName: string;
  status: "PENDING" | "APPROVED" | "INVOICED" | "CANCELLED";
  createdAt: string;
  createdBy: { id: string; name: string };
  items: { quantity: number; unitPrice: string }[];
};

const STATUS_LABEL: Record<OrderRow["status"], string> = {
  PENDING: "Beklemede",
  APPROVED: "Onaylandı",
  INVOICED: "Faturalandı",
  CANCELLED: "İptal",
};

const STATUS_COLOR: Record<OrderRow["status"], string> = {
  PENDING: "var(--warning, #d97706)",
  APPROVED: "var(--accent)",
  INVOICED: "var(--success, #16a34a)",
  CANCELLED: "var(--danger)",
};

const TABS: ("ALL" | OrderRow["status"])[] = ["ALL", "PENDING", "APPROVED", "INVOICED", "CANCELLED"];

export default function OrdersPage() {
  return (
    <Suspense fallback={null}>
      <OrdersPageInner />
    </Suspense>
  );
}

function OrdersPageInner() {
  const { user, refresh: refreshMe } = useMe();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"ALL" | OrderRow["status"]>("ALL");
  const [showCreate, setShowCreate] = useState(false);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const qs = statusFilter !== "ALL" ? `?status=${statusFilter}` : "";
    const res = await fetch(withBasePath(`/api/orders${qs}`));
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Yüklenemedi");
      setLoading(false);
      return;
    }
    setOrders(await res.json());
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- veri filtre/durum değiştiğinde sunucudan yeniden çekilir
    load();
  }, [load]);

  useEffect(() => {
    const openId = searchParams.get("open");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- bildirimden gelen ?open= parametresini detay diyaloğuna yansıtır
    if (openId) setOpenOrderId(openId);
  }, [searchParams]);

  if (!user) return null;

  const canAccess = user.role === "ADMIN" || user.canCreateOrders || user.canManageOrders;
  const canCreate = user.role === "ADMIN" || user.canCreateOrders;
  const canManage = user.role === "ADMIN" || user.canManageOrders;

  if (!canAccess) {
    return (
      <div className="min-h-screen">
        <TopBar user={user} />
        <main className="mx-auto max-w-2xl p-6 text-center">
          <p className="mt-10 text-sm" style={{ color: "var(--text-secondary)" }}>
            Bu bölüme erişiminiz yok.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <TopBar user={user} />
      <main className="mx-auto max-w-5xl p-4 sm:p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
              Siparişler
            </h1>
            <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
              {canManage
                ? "Tüm sipariş kayıtları burada listelenir."
                : "Oluşturduğunuz sipariş kayıtları burada listelenir."}
            </p>
          </div>
          {canCreate && (
            <button className="btn-primary" onClick={() => setShowCreate(true)}>
              + Yeni sipariş
            </button>
          )}
        </div>

        <div className="mb-4 flex gap-1 border-b" style={{ borderColor: "var(--border)" }}>
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setStatusFilter(t)}
              className="border-b-2 px-3 py-2 text-sm font-medium"
              style={{
                borderColor: statusFilter === t ? "var(--accent)" : "transparent",
                color: statusFilter === t ? "var(--text-primary)" : "var(--text-secondary)",
              }}
            >
              {t === "ALL" ? "Tümü" : STATUS_LABEL[t]}
            </button>
          ))}
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

        {!loading && !error && orders.length === 0 && (
          <div className="card p-8 text-center">
            <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
              Henüz sipariş kaydı yok.
            </p>
          </div>
        )}

        {!loading && !error && orders.length > 0 && (
          <div className="card overflow-hidden">
            {orders.map((o) => {
              const total = o.items.reduce((sum, i) => sum + i.quantity * Number(i.unitPrice), 0);
              return (
                <button
                  key={o.id}
                  onClick={() => setOpenOrderId(o.id)}
                  className="flex w-full flex-wrap items-center gap-3 border-b px-4 py-3 text-left last:border-0 hover:opacity-90"
                  style={{ borderColor: "var(--border)" }}
                >
                  <div className="min-w-[10rem] flex-1">
                    <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      {o.customerName}
                    </div>
                    <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      {o.createdBy.name} · {formatDate(o.createdAt)}
                    </div>
                  </div>
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {formatCurrencyTL(total)}
                  </span>
                  <span
                    className="rounded-full px-2.5 py-1 text-xs font-medium text-white"
                    style={{ background: STATUS_COLOR[o.status] }}
                  >
                    {STATUS_LABEL[o.status]}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </main>

      {showCreate && (
        <OrderDialog
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            load();
            refreshMe();
          }}
        />
      )}

      {openOrderId && (
        <OrderDetailDialog
          orderId={openOrderId}
          currentUserId={user.id}
          canManage={canManage}
          onClose={() => {
            setOpenOrderId(null);
            if (searchParams.get("open")) router.replace("/orders");
          }}
          onChanged={load}
        />
      )}
    </div>
  );
}
