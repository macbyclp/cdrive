"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { useMe } from "@/lib/useMe";
import { withBasePath } from "@/lib/basePath";
import { formatBytesStr } from "@/lib/format";

/**
 * Raporlama ekranı — aylık ciro/tahsilat trendi (SVG çubuk grafik) ve departman
 * depolama dolulukları. Endpoint'ler ADMIN-only olduğu için sayfa da sadece
 * ADMIN'e açılır (sidebar linki de koşullu, bkz. AppSidebar).
 *
 * API sözleşmesi backend şeridiyle paralel geliştirildiği için tipler burada
 * LOKAL olarak tanımlı — @/lib/reports'tan import yok.
 */
type MonthlyRow = { month: string; revenue: number; collected: number; orderCount: number };
type MonthlyReport = { months: MonthlyRow[] };
type StorageDepartment = { id: string; name: string; usedBytes: number; quotaBytes: number; userCount: number };
type StorageReport = {
  departments: StorageDepartment[];
  unassigned: { usedBytes: number; userCount: number };
};

// Para biçimlendirme — panel/page.tsx:41'deki pattern'in aynısı (TL, binlik ayraç, ondalıksız).
const TL = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 });
// Eksen etiketleri için kompakt versiyon ("₺1,2 Mn" gibi) — değişimin hover'daki tam değerle karışmaması için.
const TL_COMPACT = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  notation: "compact",
  maximumFractionDigits: 1,
});

const MONTHS_SHORT = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"] as const;

/** "2026-08" → { short: "Ağu", title: "Ağu 2026" }. Bozuk girişte ham string'e düşer. */
function monthLabel(month: string): { short: string; title: string } {
  const [y, m] = month.split("-");
  const idx = Number(m) - 1;
  if (!y || !Number.isInteger(idx) || idx < 0 || idx > 11) return { short: month, title: month };
  return { short: MONTHS_SHORT[idx], title: `${MONTHS_SHORT[idx]} ${y}` };
}

/**
 * Dikey ÇİFT bar grafiği — her ay için ciro (accent) + tahsilat (success) yan yana.
 * Grafik kütüphanesi yok; repo pattern'i gibi saf SVG (donut: panel/page.tsx, yatay
 * bar: admin/page.tsx). viewBox + %100 genişlik ile responsive.
 */
function MonthlyChart({ months }: { months: MonthlyRow[] }) {
  const W = 720;
  const H = 260;
  const PAD_L = 56;
  const PAD_R = 12;
  const PAD_T = 14;
  const PAD_B = 26;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const baseline = PAD_T + plotH;

  const maxValue = Math.max(1, ...months.map((m) => Math.max(m.revenue, m.collected)));
  // Üst tık "şirin" bir değere yuvarlanır ki eksende ₺1,2 Mn / ₺600 B gibi temiz etiketler dursun.
  const step = Math.pow(10, Math.floor(Math.log10(maxValue))) / 2;
  const top = Math.ceil(maxValue / step) * step;

  const slotW = plotW / months.length;
  const barW = Math.min(16, slotW * 0.32);
  const pairGap = 4;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Aylık ciro ve tahsilat grafiği">
      {/* Y ekseni — 0 / yarı / tam kılavuz çizgileri ve kompakt etiketleri */}
      {[1, 0.5, 0].map((t) => {
        const y = baseline - t * plotH;
        return (
          <g key={t}>
            <text x={PAD_L - 8} y={y + 3} textAnchor="end" fontSize={10} fill="var(--text-tertiary)">
              {TL_COMPACT.format(top * t)}
            </text>
            <line
              x1={PAD_L}
              y1={y}
              x2={W - PAD_R}
              y2={y}
              stroke="var(--border)"
              strokeWidth={1}
              strokeDasharray={t === 0 || t === 1 ? undefined : "3 3"}
            />
          </g>
        );
      })}
      {months.map((m, i) => {
        const { short, title } = monthLabel(m.month);
        const x0 = PAD_L + i * slotW + (slotW - (barW * 2 + pairGap)) / 2;
        const hRevenue = m.revenue > 0 ? Math.max(2, (m.revenue / top) * plotH) : 0;
        const hCollected = m.collected > 0 ? Math.max(2, (m.collected / top) * plotH) : 0;
        return (
          <g key={m.month}>
            <title>{`${title} · Ciro: ${TL.format(m.revenue)} · Tahsilat: ${TL.format(m.collected)}${
              m.orderCount > 0 ? ` · ${m.orderCount} sipariş` : ""
            }`}</title>
            <rect x={x0} y={baseline - hRevenue} width={barW} height={hRevenue} rx={3} fill="var(--accent)" />
            <rect
              x={x0 + barW + pairGap}
              y={baseline - hCollected}
              width={barW}
              height={hCollected}
              rx={3}
              fill="var(--success)"
            />
            <text
              x={PAD_L + i * slotW + slotW / 2}
              y={H - 8}
              textAnchor="middle"
              fontSize={10}
              fill="var(--text-tertiary)"
            >
              {short}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Tek departmanın doluluk satırı — isim/kullanıcı, kota kullanımı barı, "X / Y" metni. */
function StorageRow({ dept }: { dept: StorageDepartment }) {
  const pct = dept.quotaBytes > 0 ? Math.round((dept.usedBytes / dept.quotaBytes) * 100) : 0;
  const over = dept.quotaBytes > 0 && dept.usedBytes > dept.quotaBytes;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-xs sm:text-sm">
        <span style={{ color: "var(--text-primary)" }}>
          {dept.name} · <span style={{ color: "var(--text-tertiary)" }}>{dept.userCount} kullanıcı</span>
        </span>
        <span
          className="shrink-0 font-medium"
          style={over ? { color: "var(--danger)" } : { color: "var(--text-secondary)" }}
        >
          {formatBytesStr(dept.usedBytes)} / {formatBytesStr(dept.quotaBytes)} · %{pct}
        </span>
      </div>
      <div className="h-2.5 w-full rounded-full" style={{ background: "var(--surface-muted)" }}>
        <div
          className="h-2.5 rounded-full transition-all"
          style={{
            width: `${Math.min(100, dept.usedBytes > 0 ? Math.max(pct, 2) : 0)}%`,
            background: over ? "var(--danger)" : "var(--accent)",
          }}
        />
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const { user, refresh } = useMe();
  const [monthly, setMonthly] = useState<MonthlyRow[] | null>(null);
  const [monthlyError, setMonthlyError] = useState<string | null>(null);
  const [storage, setStorage] = useState<StorageReport | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const isAdmin = user?.role === "ADMIN";

  useEffect(() => {
    if (!isAdmin) return;
    fetch(withBasePath("/api/reports/monthly?months=12"))
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error ?? "Yüklenemedi");
        }
        return r.json() as Promise<MonthlyReport>;
      })
      .then((d) => setMonthly(d.months ?? []))
      .catch((e) => setMonthlyError(e.message));
    fetch(withBasePath("/api/reports/storage"))
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error ?? "Yüklenemedi");
        }
        return r.json() as Promise<StorageReport>;
      })
      .then(setStorage)
      .catch((e) => setStorageError(e.message));
  }, [isAdmin]);

  if (!user) return null;

  if (!isAdmin) {
    return (
      <AppShell user={user} active="reports">
        <div className="card p-6 text-sm" style={{ color: "var(--danger)" }}>
          Yetkisiz erişim — bu sayfa yalnızca yönetici (ADMIN) hesaplarına açıktır.
        </div>
      </AppShell>
    );
  }

  const hasMonthlyData = (monthly ?? []).some((m) => m.revenue > 0 || m.collected > 0 || m.orderCount > 0);
  const showUnassigned =
    !!storage && (storage.unassigned.userCount > 0 || storage.unassigned.usedBytes > 0);
  const hasStorageData = !!storage && (storage.departments.length > 0 || showUnassigned);

  return (
    <AppShell user={user} active="reports">
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Raporlar 📊
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            Aylık ciro/tahsilat trendi ve departman depolama kullanımı
          </p>
        </div>

        {/* Aylık ciro / tahsilat */}
        <div className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                Aylık Ciro ve Tahsilat
              </h2>
              <p className="mt-0.5 text-xs" style={{ color: "var(--text-tertiary)" }}>
                Son 12 ay — çubukların üzerine gelin
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs" style={{ color: "var(--text-secondary)" }}>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--accent)" }} />
                Ciro
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--success)" }} />
                Tahsilat
              </span>
            </div>
          </div>
          <div className="mt-4">
            {monthlyError && (
              <p className="text-sm" style={{ color: "var(--danger)" }}>
                {monthlyError}
              </p>
            )}
            {!monthly && !monthlyError && <div className="skeleton h-64 w-full" />}
            {monthly && !hasMonthlyData && (
              <p className="py-10 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>
                Henüz veri yok
              </p>
            )}
            {monthly && hasMonthlyData && <MonthlyChart months={monthly} />}
          </div>
        </div>

        {/* Departman depolama */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Departman Depolama
          </h2>
          <p className="mt-0.5 text-xs" style={{ color: "var(--text-tertiary)" }}>
            Kota doluluğu — kotayı aşan departmanlar kırmızı vurgulanır
          </p>
          <div className="mt-4">
            {storageError && (
              <p className="text-sm" style={{ color: "var(--danger)" }}>
                {storageError}
              </p>
            )}
            {!storage && !storageError && <div className="skeleton h-40 w-full" />}
            {storage && !hasStorageData && (
              <p className="py-8 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>
                Henüz veri yok
              </p>
            )}
            {storage && hasStorageData && (
              <div className="space-y-4">
                {storage.departments.map((d) => (
                  <StorageRow key={d.id} dept={d} />
                ))}
                {/* Departmana bağlı olmayan kullanıcılar — kotasız, sadece toplam kullanım */}
                {showUnassigned && (
                  <div className="border-t pt-3" style={{ borderColor: "var(--border)" }}>
                    <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
                      <span style={{ color: "var(--text-primary)" }}>
                        Departmansız ·{" "}
                        <span style={{ color: "var(--text-tertiary)" }}>
                          {storage.unassigned.userCount} kullanıcı
                        </span>
                      </span>
                      <span className="shrink-0 font-medium" style={{ color: "var(--text-secondary)" }}>
                        {formatBytesStr(storage.unassigned.usedBytes)} kullanım
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
