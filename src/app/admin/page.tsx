"use client";

import { useEffect, useState } from "react";
import TopBar from "@/components/TopBar";
import { useToast } from "@/components/ToastProvider";
import type { MeUser } from "@/lib/types";
import { formatBytesStr, formatDate } from "@/lib/format";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "MANAGER" | "MEMBER";
  active: boolean;
  usedBytes: string;
  quotaBytes: string;
  department: { id: string; name: string } | null;
  createdAt: string;
};

type Department = { id: string; name: string; quotaBytes: string; _count: { users: number } };

type AuditLog = {
  id: string;
  action: string;
  detail: string | null;
  targetType: string | null;
  targetId: string | null;
  createdAt: string;
  user: { name: string; email: string } | null;
};

type Tab = "users" | "departments" | "audit";

const AVATAR_COLORS = ["#0f172a", "#7c3aed", "#0891b2", "#c2410c", "#15803d", "#be185d", "#4338ca"];
function avatarColor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export default function AdminPage() {
  const [user, setUser] = useState<MeUser | null>(null);
  const [tab, setTab] = useState<Tab>("users");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadAll() {
    setError(null);
    try {
      const [u, d] = await Promise.all([
        fetch("/api/admin/users").then((r) => (r.ok ? r.json() : Promise.reject(r))),
        fetch("/api/admin/departments").then((r) => (r.ok ? r.json() : Promise.reject(r))),
      ]);
      setUsers(u);
      setDepartments(d);
      const l = await fetch("/api/admin/audit").then((r) => (r.ok ? r.json() : []));
      setLogs(l);
    } catch {
      setError("Bu sayfayı görüntüleme yetkiniz yok.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ilk yüklemede admin verilerini sunucudan çek
    loadAll();
  }, []);

  if (!user) return null;

  return (
    <div className="min-h-screen">
      <TopBar user={user} />
      <main className="mx-auto max-w-5xl p-4 sm:p-6">
        <h1 className="mb-1 text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
          Yönetim paneli
        </h1>
        <p className="mb-6 text-sm" style={{ color: "var(--text-secondary)" }}>
          Kullanıcılar, departmanlar ve etkinlik günlüğü
        </p>

        <div className="mb-6 flex gap-1 border-b" style={{ borderColor: "var(--border)" }}>
          {(["users", "departments", "audit"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="border-b-2 px-4 py-2 text-sm font-medium"
              style={{
                borderColor: tab === t ? "var(--accent)" : "transparent",
                color: tab === t ? "var(--text-primary)" : "var(--text-secondary)",
              }}
            >
              {t === "users" ? "Kullanıcılar" : t === "departments" ? "Departmanlar" : "Etkinlik günlüğü"}
            </button>
          ))}
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {loading && !error && (
          <div className="card overflow-hidden">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 border-b px-4 py-3 last:border-0" style={{ borderColor: "var(--border)" }}>
                <div className="skeleton h-8 w-8 rounded-full" />
                <div className="skeleton h-4 w-40" />
              </div>
            ))}
          </div>
        )}

        {!loading && !error && tab === "users" && (
          <UsersTab users={users} departments={departments} reload={loadAll} currentUserId={user.id} />
        )}
        {!loading && !error && tab === "departments" && <DepartmentsTab departments={departments} reload={loadAll} />}
        {!loading && !error && tab === "audit" && <AuditTab logs={logs} />}
      </main>
    </div>
  );
}

function UsersTab({
  users,
  departments,
  reload,
  currentUserId,
}: {
  users: AdminUser[];
  departments: Department[];
  reload: () => void;
  currentUserId: string;
}) {
  const toast = useToast();
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "MEMBER", departmentId: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [quotaDrafts, setQuotaDrafts] = useState<Record<string, string>>({});

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, departmentId: form.departmentId || null }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Kullanıcı oluşturulamadı");
      return;
    }
    toast(`${form.name} eklendi`, "success");
    setForm({ name: "", email: "", password: "", role: "MEMBER", departmentId: "" });
    setShowNew(false);
    reload();
  }

  async function update(id: string, data: Record<string, unknown>, message?: string) {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast(d.error ?? "Güncellenemedi", "error");
      return;
    }
    if (message) toast(message, "success");
    reload();
  }

  function quotaGb(quotaBytes: string) {
    return (Number(quotaBytes) / 1024 ** 3).toFixed(1);
  }

  function saveQuota(userId: string) {
    const raw = quotaDrafts[userId];
    if (raw === undefined) return;
    const gb = Number(raw);
    if (!Number.isFinite(gb) || gb <= 0) {
      toast("Geçerli bir kota (GB) gir", "error");
      return;
    }
    const bytes = Math.round(gb * 1024 ** 3);
    update(userId, { quotaBytes: bytes }, "Depolama kotası güncellendi");
    setQuotaDrafts((d) => {
      const next = { ...d };
      delete next[userId];
      return next;
    });
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button className="btn-primary" onClick={() => setShowNew((s) => !s)}>
          {showNew ? "Vazgeç" : "+ Yeni kullanıcı"}
        </button>
      </div>

      {showNew && (
        <form onSubmit={createUser} className="card mb-6 grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
          <input required placeholder="Ad Soyad" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input required type="email" placeholder="E-posta" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input required minLength={8} type="password" placeholder="Geçici şifre" className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="MEMBER">Üye</option>
            <option value="MANAGER">Yönetici (Departman)</option>
            <option value="ADMIN">Admin</option>
          </select>
          <select className="input sm:col-span-2" value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
            <option value="">Departman yok</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          {error && <p className="text-sm text-red-600 dark:text-red-400 sm:col-span-2">{error}</p>}
          <button disabled={busy} className="btn-primary sm:col-span-2">
            Oluştur
          </button>
        </form>
      )}

      <div className="card overflow-hidden">
        {users.map((u) => {
          const usedPct = Math.min(100, Math.round((Number(u.usedBytes) / Math.max(Number(u.quotaBytes), 1)) * 100));
          return (
            <div key={u.id} className="flex flex-wrap items-center gap-3 border-b px-4 py-3 last:border-0" style={{ borderColor: "var(--border)" }}>
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                style={{ background: avatarColor(u.email) }}
              >
                {u.name.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-[10rem] flex-1">
                <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {u.name}
                </div>
                <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  {u.email}
                </div>
              </div>
              <select
                className="input w-36"
                value={u.role}
                disabled={u.id === currentUserId}
                onChange={(e) => update(u.id, { role: e.target.value }, "Rol güncellendi")}
              >
                <option value="MEMBER">Üye</option>
                <option value="MANAGER">Yönetici</option>
                <option value="ADMIN">Admin</option>
              </select>
              <select
                className="input w-40"
                value={u.department?.id ?? ""}
                onChange={(e) => update(u.id, { departmentId: e.target.value || null }, "Departman güncellendi")}
              >
                <option value="">Departman yok</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>

              <div className="w-44 shrink-0">
                <div className="mb-1 flex justify-between text-[11px]" style={{ color: "var(--text-secondary)" }}>
                  <span>{formatBytesStr(u.usedBytes)}</span>
                  <span>/ {formatBytesStr(u.quotaBytes)}</span>
                </div>
                <div className="mb-1.5 h-1.5 w-full rounded-full" style={{ background: "var(--surface-muted)" }}>
                  <div
                    className={`h-1.5 rounded-full ${usedPct > 90 ? "bg-red-500" : "bg-slate-900 dark:bg-slate-100"}`}
                    style={{ width: `${usedPct}%` }}
                  />
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0.1}
                    step={0.5}
                    placeholder={quotaGb(u.quotaBytes)}
                    className="input px-2 py-1 text-xs"
                    value={quotaDrafts[u.id] ?? ""}
                    onChange={(e) => setQuotaDrafts((d) => ({ ...d, [u.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveQuota(u.id);
                    }}
                  />
                  <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                    GB
                  </span>
                  <button className="btn-ghost text-xs" onClick={() => saveQuota(u.id)}>
                    Kaydet
                  </button>
                </div>
              </div>

              <button
                disabled={u.id === currentUserId}
                className={`btn-ghost ${u.active ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}
                onClick={() => update(u.id, { active: !u.active }, u.active ? "Kullanıcı pasifleştirildi" : "Kullanıcı aktifleştirildi")}
              >
                {u.active ? "Pasifleştir" : "Aktifleştir"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DepartmentsTab({ departments, reload }: { departments: Department[]; reload: () => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [quotaDrafts, setQuotaDrafts] = useState<Record<string, string>>({});

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const res = await fetch("/api/admin/departments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast(d.error ?? "Departman oluşturulamadı", "error");
      return;
    }
    toast(`"${name}" departmanı eklendi`, "success");
    setName("");
    reload();
  }

  return (
    <div>
      <form onSubmit={create} className="mb-6 flex gap-2">
        <input className="input" placeholder="Departman adı" value={name} onChange={(e) => setName(e.target.value)} />
        <button disabled={busy} className="btn-primary shrink-0">
          + Ekle
        </button>
      </form>
      <div className="card overflow-hidden">
        {departments.map((d) => (
          <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 last:border-0" style={{ borderColor: "var(--border)" }}>
            <div>
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                {d.name}
              </span>
              <span className="ml-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
                {d._count.users} kullanıcı
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                Kota: {formatBytesStr(d.quotaBytes)}
              </span>
              <input
                type="number"
                min={0.1}
                step={0.5}
                placeholder={(Number(d.quotaBytes) / 1024 ** 3).toFixed(1)}
                className="input w-20 px-2 py-1 text-xs"
                value={quotaDrafts[d.id] ?? ""}
                onChange={(e) => setQuotaDrafts((q) => ({ ...q, [d.id]: e.target.value }))}
              />
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                GB
              </span>
              <button
                className="btn-ghost text-xs"
                onClick={async () => {
                  const gb = Number(quotaDrafts[d.id]);
                  if (!Number.isFinite(gb) || gb <= 0) {
                    toast("Geçerli bir kota (GB) gir", "error");
                    return;
                  }
                  const res = await fetch(`/api/admin/departments/${d.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ quotaBytes: Math.round(gb * 1024 ** 3) }),
                  });
                  if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    toast(err.error ?? "Departman kotası güncellenemedi", "error");
                    return;
                  }
                  toast("Departman kotası güncellendi", "success");
                  setQuotaDrafts((q) => {
                    const next = { ...q };
                    delete next[d.id];
                    return next;
                  });
                  reload();
                }}
              >
                Kaydet
              </button>
            </div>
          </div>
        ))}
        {departments.length === 0 && (
          <p className="p-4 text-sm" style={{ color: "var(--text-tertiary)" }}>
            Henüz departman yok.
          </p>
        )}
      </div>
    </div>
  );
}

function AuditTab({ logs }: { logs: AuditLog[] }) {
  return (
    <div className="card overflow-hidden">
      {logs.map((l) => (
        <div key={l.id} className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5 text-sm last:border-0" style={{ borderColor: "var(--border)" }}>
          <span className="w-40 shrink-0 text-xs" style={{ color: "var(--text-tertiary)" }}>
            {formatDate(l.createdAt)}
          </span>
          <span className="rounded px-2 py-0.5 text-xs font-medium" style={{ background: "var(--surface-muted)", color: "var(--text-primary)" }}>
            {l.action}
          </span>
          <span style={{ color: "var(--text-secondary)" }}>{l.user ? l.user.name : "Anonim"}</span>
          {l.detail && (
            <span className="truncate" style={{ color: "var(--text-tertiary)" }}>
              — {l.detail}
            </span>
          )}
        </div>
      ))}
      {logs.length === 0 && (
        <p className="p-4 text-sm" style={{ color: "var(--text-tertiary)" }}>
          Kayıt yok.
        </p>
      )}
    </div>
  );
}
