"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import Avatar from "@/components/Avatar";
import CustomerMap from "@/components/CustomerMap";
import { useToast } from "@/components/ToastProvider";
import { useMe } from "@/lib/useMe";
import { withBasePath } from "@/lib/basePath";
import { formatDate, orderDisplayNumber } from "@/lib/format";

type DashboardData = {
  stats: {
    thisMonthOrderCount: number;
    orderCountTrendPct: number;
    thisMonthRevenue: number;
    revenueTrendPct: number;
    outstandingBalance: number;
  };
  statusBreakdown: { status: string; label: string; count: number }[];
  recentOrder: {
    id: string;
    orderNumber: number | null;
    customerName: string;
    customerContact: string | null;
    status: string;
    statusLabel: string;
    createdAt: string;
    dueDate: string | null;
    total: number;
    collected: number;
    itemCount: number;
    progressPct: number;
    timeline: { id: string; action: string; detail: string | null; createdAt: string; userName: string | null }[];
  } | null;
  latestCustomers: { id: string; name: string; contact: string | null; orderCount: number; revenue: number; lastOrderAt: string }[];
  mapPoints: { id: string; name: string; address: string | null; lat: number; lng: number }[];
  scoped: boolean;
};

const TL = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 });

const STATUS_COLORS: Record<string, string> = {
  PENDING: "#f59e0b",
  APPROVED: "#4f46e5",
  INVOICED: "#16a34a",
  CANCELLED: "#dc2626",
};

const ACTION_LABEL: Record<string, string> = {
  ORDER_CREATE: "Sipariş oluşturuldu",
  ORDER_STATUS_UPDATE: "Durum güncellendi",
  PAYMENT_RECORD: "Tahsilat kaydedildi",
  PAYMENT_DELETE: "Tahsilat silindi",
};

function StatCard({
  label,
  value,
  trendPct,
  icon,
}: {
  label: string;
  value: string;
  trendPct?: number;
  icon: string;
}) {
  const positive = (trendPct ?? 0) >= 0;
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
          {label}
        </span>
        <span
          className="flex h-8 w-8 items-center justify-center rounded-lg text-sm"
          style={{ background: "var(--accent-soft)" }}
        >
          {icon}
        </span>
      </div>
      <div className="mt-3 text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
        {value}
      </div>
      {trendPct !== undefined && (
        <div
          className="mt-1 text-xs font-medium"
          style={{ color: positive ? "var(--success)" : "var(--danger)" }}
        >
          {positive ? "▲" : "▼"} %{Math.abs(trendPct)} geçen aya göre
        </div>
      )}
    </div>
  );
}

const STATUS_STEPS: { key: string; label: string }[] = [
  { key: "PENDING", label: "Beklemede" },
  { key: "APPROVED", label: "Onaylandı" },
  { key: "INVOICED", label: "Faturalandı" },
];

function Donut({ breakdown }: { breakdown: { status: string; label: string; count: number }[] }) {
  const total = breakdown.reduce((s, b) => s + b.count, 0);
  const size = 140;
  const r = 52;
  const c = 2 * Math.PI * r;

  if (total === 0) {
    return (
      <div className="flex h-[140px] items-center justify-center text-sm" style={{ color: "var(--text-tertiary)" }}>
        Henüz sipariş yok
      </div>
    );
  }

  const segments: { status: string; dash: number; offset: number }[] = [];
  let runningOffset = 0;
  for (const b of breakdown) {
    if (b.count === 0) continue;
    const dash = (b.count / total) * c;
    segments.push({ status: b.status, dash, offset: runningOffset });
    runningOffset += dash;
  }

  return (
    <div className="flex items-center gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-muted)" strokeWidth={16} />
        {segments.map((s) => (
          <circle
            key={s.status}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={STATUS_COLORS[s.status]}
            strokeWidth={16}
            strokeDasharray={`${s.dash} ${c - s.dash}`}
            strokeDashoffset={-s.offset}
            strokeLinecap="butt"
          />
        ))}
      </svg>
      <div className="space-y-1.5 text-sm">
        {breakdown.map((b) => (
          <div key={b.status} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLORS[b.status] }} />
            <span style={{ color: "var(--text-secondary)" }}>{b.label}</span>
            <span className="font-medium" style={{ color: "var(--text-primary)" }}>
              {b.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PanelPage() {
  const { user, refresh } = useMe();
  const toast = useToast();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user) return;
    fetch(withBasePath("/api/dashboard"))
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error ?? "Yüklenemedi");
        }
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [user]);

  if (!user) return null;

  return (
    <AppShell user={user} active="panel">
      <div className="space-y-5">
          <div>
            <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
              Merhaba, {user.name.split(" ")[0]} 👋
            </h1>
            <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
              {data?.scoped
                ? "Kendi siparişlerinin özeti — gerçek zamanlı"
                : "Şirket geneli sipariş ve müşteri özeti — gerçek zamanlı"}
            </p>
          </div>

          {error && (
            <div className="card p-4 text-sm" style={{ color: "var(--danger)" }}>
              {error}
            </div>
          )}

          {!data && !error && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="skeleton h-28 w-full" />
              <div className="skeleton h-28 w-full" />
              <div className="skeleton h-28 w-full" />
            </div>
          )}

          {data && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatCard
                  label="Bu ay sipariş"
                  value={data.stats.thisMonthOrderCount.toString()}
                  trendPct={data.stats.orderCountTrendPct}
                  icon="📦"
                />
                <StatCard
                  label="Bu ay ciro"
                  value={TL.format(data.stats.thisMonthRevenue)}
                  trendPct={data.stats.revenueTrendPct}
                  icon="💰"
                />
                <StatCard label="Bekleyen bakiye" value={TL.format(data.stats.outstandingBalance)} icon="⏳" />
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {/* Order Info */}
                <div className="card p-5 lg:col-span-2">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                      Sipariş Bilgisi
                    </h2>
                    {data.recentOrder && (
                      <a
                        href={withBasePath(
                          `/${user.role === "ADMIN" || user.canManageOrders ? "accounting" : "orders"}?open=${data.recentOrder.id}`
                        )}
                        className="text-xs font-medium hover:underline"
                        style={{ color: "var(--accent)" }}
                      >
                        Ürünleri görüntüle →
                      </a>
                    )}
                  </div>

                  {!data.recentOrder ? (
                    <p className="mt-6 text-sm" style={{ color: "var(--text-tertiary)" }}>
                      Henüz sipariş bulunmuyor.
                    </p>
                  ) : (
                    <div className="mt-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                            {data.recentOrder.customerName}
                          </div>
                          <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                            Sipariş #{orderDisplayNumber(data.recentOrder)} ·{" "}
                            {formatDate(data.recentOrder.createdAt)}
                          </div>
                        </div>
                        <span
                          className="rounded-full px-2.5 py-1 text-xs font-medium"
                          style={{
                            background: "var(--accent-soft)",
                            color: STATUS_COLORS[data.recentOrder.status] ?? "var(--accent-soft-foreground)",
                          }}
                        >
                          {data.recentOrder.statusLabel}
                        </span>
                      </div>

                      {data.recentOrder.status !== "CANCELLED" && (
                        <div>
                          <div className="mb-1.5 h-1.5 w-full rounded-full" style={{ background: "var(--surface-muted)" }}>
                            <div
                              className="h-1.5 rounded-full transition-all"
                              style={{ width: `${data.recentOrder.progressPct}%`, background: "var(--accent)" }}
                            />
                          </div>
                          <div className="flex justify-between text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                            {STATUS_STEPS.map((s) => (
                              <span
                                key={s.key}
                                style={
                                  s.key === data.recentOrder!.status ? { color: "var(--accent)", fontWeight: 600 } : undefined
                                }
                              >
                                {s.label}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="space-y-2 border-t pt-3" style={{ borderColor: "var(--border)" }}>
                        {data.recentOrder.timeline.length === 0 && (
                          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                            Henüz bir etkinlik günlüğü yok.
                          </p>
                        )}
                        {data.recentOrder.timeline.slice(-4).map((t) => (
                          <div key={t.id} className="flex items-start gap-2 text-xs">
                            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--accent)" }} />
                            <div>
                              <span style={{ color: "var(--text-primary)" }}>{ACTION_LABEL[t.action] ?? t.action}</span>
                              {t.userName && <span style={{ color: "var(--text-tertiary)" }}> · {t.userName}</span>}
                              <span style={{ color: "var(--text-tertiary)" }}> · {formatDate(t.createdAt)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Package Information -> order summary mini card */}
                <div className="card p-5">
                  <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    Sipariş Özeti
                  </h2>
                  {!data.recentOrder ? (
                    <p className="mt-6 text-sm" style={{ color: "var(--text-tertiary)" }}>
                      —
                    </p>
                  ) : (
                    <div className="mt-4 space-y-3 text-sm">
                      <div className="flex justify-between">
                        <span style={{ color: "var(--text-secondary)" }}>Kalem sayısı</span>
                        <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                          {data.recentOrder.itemCount}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span style={{ color: "var(--text-secondary)" }}>Toplam tutar</span>
                        <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                          {TL.format(data.recentOrder.total)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span style={{ color: "var(--text-secondary)" }}>Tahsil edilen</span>
                        <span className="font-medium" style={{ color: "var(--success)" }}>
                          {TL.format(data.recentOrder.collected)}
                        </span>
                      </div>
                      <div className="flex justify-between border-t pt-3" style={{ borderColor: "var(--border)" }}>
                        <span style={{ color: "var(--text-secondary)" }}>Kalan bakiye</span>
                        <span className="font-semibold" style={{ color: "var(--danger)" }}>
                          {TL.format(Math.max(0, data.recentOrder.total - data.recentOrder.collected))}
                        </span>
                      </div>
                      {data.recentOrder.dueDate && (
                        <div className="flex justify-between text-xs">
                          <span style={{ color: "var(--text-tertiary)" }}>Vade</span>
                          <span style={{ color: "var(--text-tertiary)" }}>{formatDate(data.recentOrder.dueDate)}</span>
                        </div>
                      )}
                      {data.recentOrder.customerContact && (
                        <div className="flex justify-between text-xs">
                          <span style={{ color: "var(--text-tertiary)" }}>İletişim</span>
                          <span style={{ color: "var(--text-tertiary)" }}>{data.recentOrder.customerContact}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {/* Genel Görünüm — her zaman gerçek/etkileşimli harita (OpenStreetMap); işaretçi
                    sadece fatura ekinden geocode edilmiş gerçek müşteri adresi varsa eklenir. */}
                <div className="card overflow-hidden p-0 lg:col-span-2">
                  <div className="p-5 pb-0">
                    <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                      Genel Görünüm
                    </h2>
                    <p className="mt-0.5 text-xs" style={{ color: "var(--text-tertiary)" }}>
                      {data.mapPoints.length > 0
                        ? `${data.mapPoints.length} müşteri konumu — faturalardan otomatik çekilen adreslerden`
                        : "Bir siparişe fatura eklendiğinde adresler burada işaretlenecek"}
                    </p>
                  </div>
                  <div className="mt-4 overflow-hidden">
                    <CustomerMap points={data.mapPoints} />
                  </div>
                </div>

                {/* Shipment Overview -> real order status breakdown */}
                <div className="card p-5">
                  <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    Sipariş Durum Dağılımı
                  </h2>
                  <div className="mt-4">
                    <Donut breakdown={data.statusBreakdown} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {/* Latest customers */}
                <div className="card p-5 lg:col-span-2">
                  <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    Son Müşteriler
                  </h2>
                  {data.latestCustomers.length === 0 ? (
                    <p className="mt-4 text-sm" style={{ color: "var(--text-tertiary)" }}>
                      Henüz müşteri kaydı yok.
                    </p>
                  ) : (
                    <div className="mt-3 divide-y" style={{ borderColor: "var(--border)" }}>
                      {data.latestCustomers.map((c) => (
                        <a
                          key={c.id}
                          href={withBasePath(`/orders?customerId=${c.id}`)}
                          className="flex items-center justify-between py-2.5 text-sm hover:opacity-80"
                        >
                          <div>
                            <div className="font-medium" style={{ color: "var(--text-primary)" }}>
                              {c.name}
                            </div>
                            <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                              {c.orderCount} sipariş · son {formatDate(c.lastOrderAt)}
                            </div>
                          </div>
                          <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                            {TL.format(c.revenue)}
                          </span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                {/* Account card (replaces the reference's "Pro" upsell slot) */}
                <div className="card p-5">
                  <h2 className="mb-3 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    Hesabım
                  </h2>
                  <div className="flex items-center gap-3">
                    <Avatar name={user.name} email={user.email} avatarKey={user.avatarKey} avatarParts={user.avatarParts} size={44} />
                    <div>
                      <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                        {user.name}
                      </div>
                      <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                        {user.department ? `${user.department} · ` : ""}
                        {user.role}
                      </div>
                    </div>
                  </div>
                  <a
                    href={withBasePath("/account")}
                    className="btn-secondary mt-4 block w-full text-center text-sm"
                    onClick={() => toast("Hesap ayarlarına yönlendiriliyorsun", "success")}
                  >
                    Hesap ayarlarını yönet
                  </a>
                </div>
              </div>
            </>
          )}
      </div>
    </AppShell>
  );
}
