"use client";

import { useState } from "react";
import { useToast } from "@/components/ToastProvider";
import { withBasePath } from "@/lib/basePath";

const METHOD_LABEL: Record<string, string> = {
  CASH: "Nakit",
  BANK_TRANSFER: "Havale/EFT",
  CREDIT_CARD: "Kredi kartı",
  OTHER: "Diğer",
};

/** Bir siparişe tahsilat kaydı eklemek için küçük form diyaloğu. */
export default function PaymentDialog({
  orderId,
  remaining,
  onClose,
  onSaved,
}: {
  orderId: string;
  remaining: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [amount, setAmount] = useState(remaining > 0 ? remaining.toFixed(2) : "");
  const [method, setMethod] = useState("BANK_TRANSFER");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const n = Number(amount);
    if (!n || n <= 0) {
      setError("Geçerli bir tutar girin");
      return;
    }
    setBusy(true);
    const res = await fetch(withBasePath(`/api/orders/${orderId}/payments`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: n, method, note: note.trim() || undefined }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Kaydedilemedi");
      return;
    }
    toast("Tahsilat kaydedildi", "success");
    onSaved();
    onClose();
  }

  return (
    <div className="dialog-overlay fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 px-4">
      <form
        onSubmit={submit}
        className="dialog-panel w-full max-w-sm rounded-2xl border p-6"
        style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-lg)" }}
      >
        <h2 className="mb-4 text-base font-semibold" style={{ color: "var(--text-primary)" }}>
          Tahsilat ekle
        </h2>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium" style={{ color: "var(--text-primary)" }}>
              Tutar (₺) *
            </span>
            <input
              autoFocus
              required
              type="number"
              min={0.01}
              step={0.01}
              className="input"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium" style={{ color: "var(--text-primary)" }}>
              Ödeme yöntemi
            </span>
            <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
              {Object.entries(METHOD_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium" style={{ color: "var(--text-primary)" }}>
              Not
            </span>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Vazgeç
          </button>
          <button disabled={busy} className="btn-primary">
            Kaydet
          </button>
        </div>
      </form>
    </div>
  );
}
