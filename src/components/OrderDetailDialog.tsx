"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ToastProvider";
import { withBasePath } from "@/lib/basePath";
import { formatCurrencyTL, formatDate, iconForMime } from "@/lib/format";
import OrderDialog from "@/components/OrderDialog";

type OrderDetail = {
  id: string;
  customerName: string;
  customerContact: string | null;
  notes: string | null;
  status: "PENDING" | "APPROVED" | "INVOICED" | "CANCELLED";
  accountingNote: string | null;
  createdAt: string;
  createdBy: { id: string; name: string; email: string };
  updatedBy: { id: string; name: string; email: string } | null;
  items: { id: string; productName: string; quantity: number; unitPrice: string }[];
  attachments: { file: { id: string; name: string; mimeType: string } }[];
};

const STATUS_LABEL: Record<OrderDetail["status"], string> = {
  PENDING: "Beklemede",
  APPROVED: "Onaylandı",
  INVOICED: "Faturalandı",
  CANCELLED: "İptal",
};

const STATUS_COLOR: Record<OrderDetail["status"], string> = {
  PENDING: "var(--warning, #d97706)",
  APPROVED: "var(--accent)",
  INVOICED: "var(--success, #16a34a)",
  CANCELLED: "var(--danger)",
};

export default function OrderDetailDialog({
  orderId,
  currentUserId,
  canManage,
  onClose,
  onChanged,
}: {
  orderId: string;
  currentUserId: string;
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accountingNote, setAccountingNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  function load() {
    fetch(withBasePath(`/api/orders/${orderId}`))
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Sipariş yüklenemedi");
        setOrder(d);
        setAccountingNote(d.accountingNote ?? "");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Sipariş yüklenemedi"));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  async function changeStatus(status: OrderDetail["status"]) {
    setBusy(true);
    const res = await fetch(withBasePath(`/api/orders/${orderId}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast(d.error ?? "Güncellenemedi", "error");
      return;
    }
    toast(`Durum "${STATUS_LABEL[status]}" olarak güncellendi`, "success");
    load();
    onChanged();
  }

  async function saveNote() {
    setBusy(true);
    const res = await fetch(withBasePath(`/api/orders/${orderId}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountingNote }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast(d.error ?? "Not kaydedilemedi", "error");
      return;
    }
    toast("Not kaydedildi", "success");
    load();
  }

  if (editing && order) {
    return (
      <OrderDialog
        order={{
          id: order.id,
          customerName: order.customerName,
          customerContact: order.customerContact,
          notes: order.notes,
          items: order.items,
          attachments: order.attachments,
        }}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          load();
          onChanged();
        }}
      />
    );
  }

  const total = order?.items.reduce((sum, i) => sum + i.quantity * Number(i.unitPrice), 0) ?? 0;
  const isOwnerPending = order && order.createdBy.id === currentUserId && order.status === "PENDING";

  return (
    <div className="dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div
        className="dialog-panel flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border"
        style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-lg)" }}
      >
        <div className="flex items-start justify-between border-b p-5 pb-3" style={{ borderColor: "var(--border)" }}>
          <div>
            <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
              {order?.customerName ?? "Sipariş"}
            </h2>
            {order && (
              <p className="mt-0.5 text-sm" style={{ color: "var(--text-secondary)" }}>
                {order.createdBy.name} · {formatDate(order.createdAt)}
              </p>
            )}
          </div>
          <button onClick={onClose} className="btn-ghost">
            Kapat
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          {!error && !order && <div className="skeleton h-40 w-full" />}
          {order && (
            <>
              <div className="flex items-center gap-2">
                <span
                  className="rounded-full px-2.5 py-1 text-xs font-medium text-white"
                  style={{ background: STATUS_COLOR[order.status] }}
                >
                  {STATUS_LABEL[order.status]}
                </span>
                {order.customerContact && (
                  <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                    {order.customerContact}
                  </span>
                )}
              </div>

              <div className="overflow-hidden rounded-lg border" style={{ borderColor: "var(--border)" }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: "var(--surface-muted)" }}>
                      <th className="px-3 py-2 text-left font-medium" style={{ color: "var(--text-secondary)" }}>
                        Ürün/hizmet
                      </th>
                      <th className="px-3 py-2 text-right font-medium" style={{ color: "var(--text-secondary)" }}>
                        Adet
                      </th>
                      <th className="px-3 py-2 text-right font-medium" style={{ color: "var(--text-secondary)" }}>
                        Birim
                      </th>
                      <th className="px-3 py-2 text-right font-medium" style={{ color: "var(--text-secondary)" }}>
                        Toplam
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((i) => (
                      <tr key={i.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td className="px-3 py-2" style={{ color: "var(--text-primary)" }}>
                          {i.productName}
                        </td>
                        <td className="px-3 py-2 text-right" style={{ color: "var(--text-secondary)" }}>
                          {i.quantity}
                        </td>
                        <td className="px-3 py-2 text-right" style={{ color: "var(--text-secondary)" }}>
                          {formatCurrencyTL(i.unitPrice)}
                        </td>
                        <td className="px-3 py-2 text-right font-medium" style={{ color: "var(--text-primary)" }}>
                          {formatCurrencyTL(i.quantity * Number(i.unitPrice))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex justify-end border-t px-3 py-2 text-sm font-semibold" style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}>
                  Toplam: {formatCurrencyTL(total)}
                </div>
              </div>

              {order.notes && (
                <div>
                  <p className="mb-1 text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                    Not
                  </p>
                  <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>
                    {order.notes}
                  </p>
                </div>
              )}

              {order.attachments.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                    Ek dosyalar
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {order.attachments.map((a) => (
                      <a
                        key={a.file.id}
                        href={withBasePath(`/api/files/${a.file.id}`)}
                        target="_blank"
                        rel="noreferrer"
                        className="badge flex items-center gap-1"
                      >
                        {iconForMime(a.file.mimeType)} {a.file.name}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {canManage && (
                <div className="space-y-3 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
                  <p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                    Muhasebe işlemleri
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {order.status !== "APPROVED" && order.status !== "CANCELLED" && order.status !== "INVOICED" && (
                      <button disabled={busy} className="btn-secondary text-xs" onClick={() => changeStatus("APPROVED")}>
                        Onayla
                      </button>
                    )}
                    {order.status === "APPROVED" && (
                      <button disabled={busy} className="btn-secondary text-xs" onClick={() => changeStatus("INVOICED")}>
                        Faturalandı işaretle
                      </button>
                    )}
                    {order.status !== "CANCELLED" && order.status !== "INVOICED" && (
                      <button
                        disabled={busy}
                        className="text-xs text-red-600 dark:text-red-400"
                        onClick={() => changeStatus("CANCELLED")}
                      >
                        İptal et
                      </button>
                    )}
                    {order.status === "CANCELLED" && (
                      <button disabled={busy} className="btn-secondary text-xs" onClick={() => changeStatus("PENDING")}>
                        Beklemeye al
                      </button>
                    )}
                  </div>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                      Muhasebe notu
                    </span>
                    <textarea
                      className="input"
                      rows={2}
                      value={accountingNote}
                      onChange={(e) => setAccountingNote(e.target.value)}
                    />
                  </label>
                  <button disabled={busy} className="btn-ghost text-xs" onClick={saveNote}>
                    Notu kaydet
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {isOwnerPending && (
          <div className="flex justify-end border-t p-4" style={{ borderColor: "var(--border)" }}>
            <button className="btn-secondary text-sm" onClick={() => setEditing(true)}>
              Siparişi düzenle
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
