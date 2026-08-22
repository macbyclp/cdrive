"use client";

import { useEffect, useState } from "react";
import { formatDate } from "@/lib/format";
import { useToast } from "@/components/ToastProvider";
import { withBasePath } from "@/lib/basePath";
import { APPROVAL_STATUS_LABEL } from "@/lib/approvals";
import type { ApprovalStatus } from "@prisma/client";

type Person = { id: string; name: string; email?: string };

type Approval = {
  id: string;
  status: ApprovalStatus;
  note: string | null;
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
  requestedById: string;
  approverId: string;
  requestedBy: Person;
  approver: Person;
};

const STATUS_COLOR: Record<ApprovalStatus, string> = {
  PENDING: "var(--warning, #d97706)",
  APPROVED: "var(--success, #16a34a)",
  REJECTED: "var(--danger)",
  CANCELLED: "var(--text-tertiary)",
};

/**
 * Bir belgenin onay akışı penceresi: geçmiş istekler + duruma göre eylemler.
 *
 * Kimin ne göreceği sunucudaki kurallarla (lib/approvals.ts) aynı mantıkta:
 * onaylayıcı karar verir, isteyen geri çeker. Buradaki gizleme sadece arayüz
 * kolaylığı — asıl yetki kontrolü her zaman API'de.
 */
export default function ApprovalDialog({
  fileId,
  fileName,
  currentUserId,
  isAdmin,
  canRequest,
  onClose,
  onChanged,
}: {
  fileId: string;
  fileName: string;
  currentUserId: string;
  isAdmin: boolean;
  /** Dosyayı onaya gönderebilir mi (EDIT yetkisi) — yoksa sadece geçmişi görür. */
  canRequest: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const toast = useToast();
  const [approvals, setApprovals] = useState<Approval[] | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [approverId, setApproverId] = useState("");
  const [note, setNote] = useState("");
  const [decisionNote, setDecisionNote] = useState("");

  function load() {
    fetch(withBasePath(`/api/files/${fileId}/approvals`))
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Onay bilgisi yüklenemedi");
        setApprovals(d);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Onay bilgisi yüklenemedi"));
  }

  useEffect(() => {
    load();
    // Onaylayıcı seçimi için kullanıcı listesi — sohbetin kişi listesini yeniden
    // kullanıyoruz (aktif kullanıcılar, kendisi hariç), ayrı bir uç nokta gereksiz.
    fetch(withBasePath("/api/chat/contacts"))
      .then((r) => r.json())
      .then((d) => setPeople(d.allUsers ?? []))
      .catch(() => setPeople([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId]);

  const pending = approvals?.find((a) => a.status === "PENDING") ?? null;

  async function request(e: React.FormEvent) {
    e.preventDefault();
    if (!approverId) return;
    setBusy(true);
    const res = await fetch(withBasePath(`/api/files/${fileId}/approvals`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approverId, note: note.trim() || undefined }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast(d.error ?? "Onaya gönderilemedi", "error");
      return;
    }
    setApproverId("");
    setNote("");
    toast("Onaya gönderildi", "success");
    load();
    onChanged?.();
  }

  async function decide(id: string, action: "approve" | "reject" | "cancel") {
    setBusy(true);
    const res = await fetch(withBasePath(`/api/approvals/${id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, decisionNote: decisionNote.trim() || undefined }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast(d.error ?? "İşlem başarısız", "error");
      return;
    }
    setDecisionNote("");
    toast(
      action === "approve" ? "Onaylandı" : action === "reject" ? "Reddedildi" : "Geri çekildi",
      "success"
    );
    load();
    onChanged?.();
  }

  return (
    <div className="dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div
        className="dialog-panel flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border"
        style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-lg)" }}
      >
        <div className="border-b p-5 pb-3" style={{ borderColor: "var(--border)" }}>
          <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            Belge onayı
          </h2>
          <p className="mt-0.5 truncate text-sm" style={{ color: "var(--text-secondary)" }}>
            {fileName}
          </p>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5 pt-4">
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          {!error && !approvals && <div className="skeleton h-16 w-full" />}

          {/* Bana gelen bekleyen istek — karar ver */}
          {pending && pending.approverId === currentUserId && (
            <div
              className="space-y-3 rounded-xl border p-4"
              style={{ borderColor: "var(--warning, #d97706)", background: "var(--surface-muted)" }}
            >
              <p className="text-sm" style={{ color: "var(--text-primary)" }}>
                <strong>{pending.requestedBy.name}</strong> bu belgeyi onayınıza gönderdi.
              </p>
              {pending.note && (
                <p className="whitespace-pre-wrap text-sm" style={{ color: "var(--text-secondary)" }}>
                  “{pending.note}”
                </p>
              )}
              <input
                className="input"
                placeholder="Gerekçe / not (isteğe bağlı)"
                value={decisionNote}
                onChange={(e) => setDecisionNote(e.target.value)}
                maxLength={2000}
              />
              <div className="flex gap-2">
                <button disabled={busy} className="btn-primary" onClick={() => decide(pending.id, "approve")}>
                  ✓ Onayla
                </button>
                <button
                  disabled={busy}
                  className="btn-secondary"
                  style={{ color: "var(--danger)" }}
                  onClick={() => decide(pending.id, "reject")}
                >
                  ✕ Reddet
                </button>
              </div>
            </div>
          )}

          {/* Benim gönderdiğim bekleyen istek — geri çek */}
          {pending && pending.approverId !== currentUserId && (
            <div
              className="flex items-center justify-between gap-3 rounded-xl border p-4"
              style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}
            >
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                <strong style={{ color: "var(--text-primary)" }}>{pending.approver.name}</strong>{" "}
                kişisinin onayı bekleniyor.
              </p>
              {(pending.requestedById === currentUserId || isAdmin) && (
                <button disabled={busy} className="btn-ghost shrink-0 text-sm" onClick={() => decide(pending.id, "cancel")}>
                  Geri çek
                </button>
              )}
            </div>
          )}

          {/* Yeni istek — sadece bekleyen yokken ve yetki varsa */}
          {!pending && canRequest && (
            <form onSubmit={request} className="space-y-2">
              <label className="block text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                Onaya gönder
              </label>
              <select className="input" value={approverId} onChange={(e) => setApproverId(e.target.value)}>
                <option value="">Onaylayacak kişiyi seç…</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <input
                className="input"
                placeholder="Not (isteğe bağlı)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={2000}
              />
              <button disabled={busy || !approverId} className="btn-primary">
                Onaya gönder
              </button>
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                Seçtiğin kişi bu belgeyi görebilir hale gelir (düzenleyemez).
              </p>
            </form>
          )}

          {!pending && !canRequest && approvals && approvals.length === 0 && (
            <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
              Bu belge için onay isteği yok.
            </p>
          )}

          {/* Geçmiş */}
          {approvals && approvals.filter((a) => a.status !== "PENDING").length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
                Geçmiş
              </p>
              <ul className="space-y-2">
                {approvals
                  .filter((a) => a.status !== "PENDING")
                  .map((a) => (
                    <li key={a.id} className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--border)" }}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium" style={{ color: STATUS_COLOR[a.status] }}>
                          {APPROVAL_STATUS_LABEL[a.status]}
                        </span>
                        <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                          {formatDate(a.decidedAt ?? a.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                        {a.requestedBy.name} → {a.approver.name}
                      </p>
                      {a.decisionNote && (
                        <p className="mt-1 whitespace-pre-wrap text-sm" style={{ color: "var(--text-secondary)" }}>
                          “{a.decisionNote}”
                        </p>
                      )}
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex justify-end border-t px-4 py-3" style={{ borderColor: "var(--border)" }}>
          <button className="btn-ghost" onClick={onClose}>
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
