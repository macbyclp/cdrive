"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import OrderDialog from "@/components/OrderDialog";
import OrderDetailDialog from "@/components/OrderDetailDialog";
import { useMe } from "@/lib/useMe";
import { formatCurrencyTL, formatDate } from "@/lib/format";
import { withBasePath } from "@/lib/basePath";

type OrderRow = {
  id: string;
  customerName: string;
  status: "PENDING" | "APPROVED" | "IN_PRODUCTION" | "INVOICED" | "CANCELLED";
  createdAt: string;
  createdBy: { id: string; name: string };
  items: { quantity: number; unitPrice: string }[];
  payments: { amount: string }[];
  dueDate: string | null;
};

const STATUS_LABEL: Record<OrderRow["status"], string> = {
  PENDING: "Beklemede",
  APPROVED: "Onaylandı",
  IN_PRODUCTION: "Üretimde",
  INVOICED: "Faturalandı",
  CANCELLED: "İptal",
};

const STATUS_COLOR: Record<OrderRow["status"], string> = {
  PENDING: "var(--warning, #d97706)",
  APPROVED: "var(--accent)",
  IN_PRODUCTION: "#9333ea",
  INVOICED: "var(--success, #16a34a)",
  CANCELLED: "var(--danger)",
};

const TABS: ("ALL" | OrderRow["status"])[] = ["ALL", "PENDING", "APPROVED", "IN_PRODUCTION", "INVOICED", "CANCELLED"];

/**
 * Sipariş listesi ekranı — üç ayrı ekranın (Satış /orders, Muhasebe /accounting, Üretim
 * /production) ortak gövdesi. `mode="sales"` her zaman ?mine=1 gönderir (muhasebe yetkisi
 * olan biri satış ekranındayken bile sadece kendi siparişlerini görsün, ekranlar birbirine
 * karışmasın) ve detay diyaloğunda muhasebe işlemlerini (onay/tahsilat) hiç göstermez;
 * `mode="accounting"` tüm şirketi görür ve tam muhasebe yetkisiyle açar; `mode="production"`
 * sadece "Üretimde" durumundaki siparişleri sabit bir kuyruk olarak gösterir (sekme/arama/yeni
 * sipariş yok — o ekranların işi değil). Stok işaretleme yetkisi (canManageProduction) hangi
 * ekrandan açıldığına bakmaksızın kişiye bağlıdır, bkz. OrderDetailDialog.
 */
export default function OrdersScreen({ mode }: { mode: "sales" | "accounting" | "production" }) {
  return (
    <Suspense fallback={null}>
      <OrdersScreenInner mode={mode} />
    </Suspense>
  );
}

function OrdersScreenInner({ mode }: { mode: "sales" | "accounting" | "production" }) {
  const { user, refresh: refreshMe } = useMe();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"ALL" | OrderRow["status"]>("ALL");
  const [q, setQ] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const customerId = searchParams.get("customerId");
  const basePath = mode === "sales" ? "/orders" : mode === "accounting" ? "/accounting" : "/production";

  function buildQuery() {
    const params = new URLSearchParams();
    // Üretim ekranı sabit bir kuyruk — sekme/arama yok, her zaman sadece "Üretimde" gelir.
    if (mode === "production") params.set("status", "IN_PRODUCTION");
    else if (statusFilter !== "ALL") params.set("status", statusFilter);
    if (mode !== "production" && q.trim()) params.set("q", q.trim());
    if (customerId) params.set("customerId", customerId);
    if (mode === "sales") params.set("mine", "1");
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch(withBasePath(`/api/orders${buildQuery()}`));
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Yüklenemedi");
      setLoading(false);
      return;
    }
    setOrders(await res.json());
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, q, customerId, mode]);

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

  const gate =
    mode === "sales"
      ? user.role === "ADMIN" || user.canCreateOrders
      : mode === "accounting"
        ? user.role === "ADMIN" || user.canManageOrders
        : user.role === "ADMIN" || user.canManageProduction;
  // Detay diyaloğundaki muhasebe işlemleri (onay/tahsilat) sadece Muhasebe ekranında açık —
  // Satış/Üretim ekranında kullanıcı gerçekten muhasebe yetkisine sahip olsa bile burada
  // gösterilmez, ekranlar net ayrılsın diye.
  const canManageHere = mode === "accounting" && (user.role === "ADMIN" || user.canManageOrders);
  // Stok işaretleme yetkisi ekrana değil kişiye bağlı — hangi ekrandan açılırsa açılsın aynı.
  const canManageProductionHere = user.role === "ADMIN" || user.canManageProduction;
  const canCreate = user.role === "ADMIN" || user.canCreateOrders;

  const summary = orders.reduce(
    (acc, o) => {
      if (o.status === "CANCELLED") return acc;
      const total = o.items.reduce((sum, i) => sum + i.quantity * Number(i.unitPrice), 0);
      const collected = o.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      acc.revenue += total;
      acc.collected += collected;
      acc.remaining += Math.max(0, total - collected);
      return acc;
    },
    { revenue: 0, collected: 0, remaining: 0 }
  );

  const activeTab: "sales" | "accounting" | "production" = mode;

  if (!gate) {
    return (
      <AppShell user={user} active={activeTab}>
        <div className="mx-auto max-w-2xl p-6 text-center">
          <p className="mt-10 text-sm" style={{ color: "var(--text-secondary)" }}>
            Bu bölüme erişiminiz yok.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <>
    <AppShell user={user} active={activeTab}>
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
              {mode === "sales" ? "Satış" : mode === "accounting" ? "Muhasebe" : "Üretim"}
            </h1>
            <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
              {mode === "sales"
                ? "Açtığınız sipariş kayıtları ve durumları burada listelenir."
                : mode === "accounting"
                  ? "Tüm sipariş kayıtları, onay/fatura durumu ve tahsilat burada yönetilir."
                  : "Stoğu olmayıp üretime gönderilen siparişler burada listelenir — stok kontrolü ve üretim tamamlama sipariş detayından yapılır."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {mode !== "production" && (
              <a href={withBasePath("/customers")} className="btn-secondary text-sm">
                Müşteriler
              </a>
            )}
            {mode !== "production" && (
              <a href={withBasePath(`/api/orders/export${buildQuery()}`)} className="btn-secondary text-sm">
                Excel&apos;e aktar
              </a>
            )}
            {mode === "sales" && canCreate && (
              <button className="btn-primary" onClick={() => setShowCreate(true)}>
                + Yeni sipariş
              </button>
            )}
          </div>
        </div>

        {mode !== "production" && !loading && !error && orders.length > 0 && (
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="card p-4">
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {mode === "sales" ? "Toplam satış" : "Toplam ciro"}
              </p>
              <p className="mt-1 text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
                {formatCurrencyTL(summary.revenue)}
              </p>
            </div>
            <div className="card p-4">
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                Tahsil edilen
              </p>
              <p className="mt-1 text-xl font-semibold" style={{ color: "var(--success, #16a34a)" }}>
                {formatCurrencyTL(summary.collected)}
              </p>
            </div>
            <div className="card p-4">
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                Bekleyen bakiye
              </p>
              <p className="mt-1 text-xl font-semibold" style={{ color: summary.remaining > 0 ? "var(--warning, #d97706)" : "var(--text-primary)" }}>
                {formatCurrencyTL(summary.remaining)}
              </p>
            </div>
          </div>
        )}

        {mode !== "production" && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 border-b" style={{ borderColor: "var(--border)" }}>
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
          <div className="flex items-center gap-2">
            {customerId && (
              <button className="badge flex items-center gap-1" onClick={() => router.replace(basePath)}>
                Müşteri filtresi aktif
                <span className="text-red-600 dark:text-red-400">×</span>
              </button>
            )}
            <input
              className="input max-w-xs"
              placeholder="Müşteri adıyla ara…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
        )}

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
              const collected = o.payments.reduce((sum, p) => sum + Number(p.amount), 0);
              const isOverdue = !!o.dueDate && collected < total && new Date(o.dueDate) < new Date() && o.status !== "CANCELLED";
              const paymentLabel = collected <= 0 ? "Ödenmedi" : collected < total ? "Kısmi ödendi" : "Ödendi";
              const paymentColor =
                collected <= 0
                  ? "var(--text-tertiary)"
                  : collected < total
                    ? "var(--warning, #d97706)"
                    : "var(--success, #16a34a)";
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
                  {o.status !== "CANCELLED" && (
                    <span className="text-xs font-medium" style={{ color: paymentColor }}>
                      {paymentLabel}
                    </span>
                  )}
                  {isOverdue && (
                    <span className="rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ background: "var(--danger)" }}>
                      Gecikmiş
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>

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
          canManage={canManageHere}
          canManageProduction={canManageProductionHere}
          onClose={() => {
            setOpenOrderId(null);
            if (searchParams.get("open")) router.replace(basePath);
          }}
          onChanged={load}
        />
      )}
    </>
  );
}
