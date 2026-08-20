"use client";

import { useState } from "react";
import { useToast } from "@/components/ToastProvider";
import { withBasePath } from "@/lib/basePath";
import FilePickerDialog from "@/components/FilePickerDialog";
import { iconForMime } from "@/lib/format";

type ItemDraft = { productName: string; quantity: string; unitPrice: string };
type AttachedFile = { id: string; name: string; mimeType: string };

type EditableOrder = {
  id: string;
  customerName: string;
  customerContact: string | null;
  notes: string | null;
  dueDate?: string | null;
  items: { productName: string; quantity: number; unitPrice: string }[];
  attachments: { file: AttachedFile }[];
};

/** Bir şablondan "Yeni Sipariş" formunu önceden doldurmak için — id/attachments yok, her zaman yeni bir sipariş oluşturur. */
type OrderPrefill = {
  customerName: string;
  customerContact: string | null;
  notes: string | null;
  items: { productName: string; quantity: number; unitPrice: number }[];
};

/** ISO tarih-saatini <input type="date"> için "YYYY-MM-DD"ye çevirir. */
function toDateInputValue(iso?: string | null) {
  if (!iso) return "";
  return iso.slice(0, 10);
}

const emptyItem: ItemDraft = { productName: "", quantity: "1", unitPrice: "" };

/** Yeni sipariş oluşturma ya da (sadece "Beklemede" durumundaki) kendi siparişini düzenleme diyaloğu. */
export default function OrderDialog({
  order,
  prefill,
  onClose,
  onSaved,
}: {
  order?: EditableOrder;
  /** Bir şablondan "Kullan" ile açıldıysa — sadece isEdit=false iken anlamlı. */
  prefill?: OrderPrefill;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const isEdit = !!order;
  const [customerName, setCustomerName] = useState(order?.customerName ?? prefill?.customerName ?? "");
  const [customerContact, setCustomerContact] = useState(order?.customerContact ?? prefill?.customerContact ?? "");
  const [notes, setNotes] = useState(order?.notes ?? prefill?.notes ?? "");
  const [dueDate, setDueDate] = useState(toDateInputValue(order?.dueDate));
  const [items, setItems] = useState<ItemDraft[]>(() => {
    if (order?.items.length) return order.items.map((i) => ({ productName: i.productName, quantity: String(i.quantity), unitPrice: i.unitPrice }));
    if (prefill?.items.length) return prefill.items.map((i) => ({ productName: i.productName, quantity: String(i.quantity), unitPrice: String(i.unitPrice) }));
    return [{ ...emptyItem }];
  });
  const [attachments, setAttachments] = useState<AttachedFile[]>(order?.attachments.map((a) => a.file) ?? []);
  const [pickingFile, setPickingFile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");

  function updateItem(idx: number, patch: Partial<ItemDraft>) {
    setItems((its) => its.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function addItem() {
    setItems((its) => [...its, { ...emptyItem }]);
  }

  function removeItem(idx: number) {
    setItems((its) => (its.length > 1 ? its.filter((_, i) => i !== idx) : its));
  }

  const total = items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsedItems = items
      .filter((it) => it.productName.trim())
      .map((it) => ({
        productName: it.productName.trim(),
        quantity: Math.max(1, Math.round(Number(it.quantity) || 1)),
        unitPrice: Math.max(0, Number(it.unitPrice) || 0),
      }));
    if (parsedItems.length === 0) {
      setError("En az bir ürün/hizmet kalemi girmelisiniz");
      return;
    }

    const payload = {
      customerName: customerName.trim(),
      customerContact: customerContact.trim() || undefined,
      notes: notes.trim() || undefined,
      items: parsedItems,
      fileIds: attachments.map((f) => f.id),
      dueDate: dueDate ? new Date(`${dueDate}T12:00:00`).toISOString() : isEdit ? null : undefined,
    };

    setBusy(true);
    const res = await fetch(
      withBasePath(isEdit ? `/api/orders/${order!.id}` : "/api/orders"),
      {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Kaydedilemedi");
      return;
    }
    toast(isEdit ? "Sipariş güncellendi" : "Sipariş oluşturuldu", "success");

    // Şablon olarak kaydetme, siparişi oluşturmayı ASLA bloklamaz — best-effort, ayrı bir istek.
    if (!isEdit && saveAsTemplate && templateName.trim()) {
      const tRes = await fetch(withBasePath("/api/order-templates"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: templateName.trim(), customerName: payload.customerName, customerContact: payload.customerContact, notes: payload.notes, items: parsedItems }),
      });
      if (tRes.ok) toast(`"${templateName.trim()}" şablon olarak kaydedildi`, "success");
      else toast("Sipariş oluşturuldu ama şablon kaydedilemedi", "error");
    }

    onSaved();
    onClose();
  }

  return (
    <div className="dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <form
        onSubmit={submit}
        className="dialog-panel flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border"
        style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-lg)" }}
      >
        <div className="border-b p-5 pb-3" style={{ borderColor: "var(--border)" }}>
          <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            {isEdit ? "Siparişi düzenle" : "Yeni sipariş"}
          </h2>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                Müşteri adı *
              </span>
              <input required className="input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                İletişim (telefon/e-posta)
              </span>
              <input className="input" value={customerContact} onChange={(e) => setCustomerContact(e.target.value)} />
            </label>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                Ürün / hizmet kalemleri *
              </span>
              <button type="button" className="btn-ghost text-xs" onClick={addItem}>
                + Kalem ekle
              </button>
            </div>
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <input
                    className="input flex-1"
                    placeholder="Ürün/hizmet adı"
                    value={it.productName}
                    onChange={(e) => updateItem(idx, { productName: e.target.value })}
                  />
                  <input
                    type="number"
                    min={1}
                    className="input w-20 px-2"
                    placeholder="Adet"
                    value={it.quantity}
                    onChange={(e) => updateItem(idx, { quantity: e.target.value })}
                  />
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    className="input w-24 px-2"
                    placeholder="Birim ₺"
                    value={it.unitPrice}
                    onChange={(e) => updateItem(idx, { unitPrice: e.target.value })}
                  />
                  <button
                    type="button"
                    className="btn-ghost shrink-0 text-red-600 dark:text-red-400"
                    onClick={() => removeItem(idx)}
                    disabled={items.length === 1}
                  >
                    Sil
                  </button>
                </div>
              ))}
            </div>
            <p className="mt-2 text-right text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              Toplam: {new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(total)}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                Vade tarihi
              </span>
              <input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-medium" style={{ color: "var(--text-primary)" }}>
              Not
            </span>
            <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                Ek dosyalar (teklif, sözleşme vb.)
              </span>
              <button type="button" className="btn-ghost text-xs" onClick={() => setPickingFile(true)}>
                + Dosya ekle
              </button>
            </div>
            {attachments.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                Eklenmiş dosya yok.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {attachments.map((f) => (
                  <span key={f.id} className="badge flex items-center gap-1">
                    {iconForMime(f.mimeType)} {f.name}
                    <button
                      type="button"
                      className="text-red-600 dark:text-red-400"
                      onClick={() => setAttachments((a) => a.filter((x) => x.id !== f.id))}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {!isEdit && (
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-0.5" checked={saveAsTemplate} onChange={(e) => setSaveAsTemplate(e.target.checked)} />
              <span className="flex-1">
                <span className="block text-sm" style={{ color: "var(--text-primary)" }}>
                  🔁 Tekrarlayan sipariş şablonu olarak kaydet
                </span>
                {saveAsTemplate && (
                  <input
                    className="input mt-1.5 text-sm"
                    placeholder="Şablon adı (örn. Migros haftalık)"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                  />
                )}
              </span>
            </label>
          )}

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t p-4" style={{ borderColor: "var(--border)" }}>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Vazgeç
          </button>
          <button disabled={busy} className="btn-primary">
            {isEdit ? "Kaydet" : "Oluştur"}
          </button>
        </div>
      </form>

      {pickingFile && (
        <FilePickerDialog
          initiallySelected={attachments}
          onCancel={() => setPickingFile(false)}
          onConfirm={(files) => {
            setAttachments(files);
            setPickingFile(false);
          }}
        />
      )}
    </div>
  );
}
