"use client";

import { useEffect, useState } from "react";
import TopBar from "@/components/TopBar";
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

export default function AdminPage() {
  const [user, setUser] = useState<MeUser | null>(null);
  const [tab, setTab] = useState<Tab>("users");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
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
      <main className="mx-auto max-w-5xl p-6">
        <h1 className="mb-1 text-xl font-semibold text-slate-900">Yönetim paneli</h1>
        <p className="mb-6 text-sm text-slate-500">Kullanıcılar, departmanlar ve etkinlik günlüğü</p>

        <div className="mb-6 flex gap-1 border-b border-slate-200">
          {(["users", "departments", "audit"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium ${
                tab === t ? "border-b-2 border-slate-900 text-slate-900" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {t === "users" ? "Kullanıcılar" : t === "departments" ? "Departmanlar" : "Etkinlik günlüğü"}
            </button>
          ))}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {!error && tab === "users" && (
          <UsersTab users={users} departments={departments} reload={loadAll} currentUserId={user.id} />
        )}
        {!error && tab === "departments" && <DepartmentsTab departments={departments} reload={loadAll} />}
        {!error && tab === "audit" && <AuditTab logs={logs} />}
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
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "MEMBER", departmentId: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    setForm({ name: "", email: "", password: "", role: "MEMBER", departmentId: "" });
    setShowNew(false);
    reload();
  }

  async function update(id: string, data: Record<string, unknown>) {
    await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    reload();
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
          {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
          <button disabled={busy} className="btn-primary sm:col-span-2">
            Oluştur
          </button>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {users.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0">
            <div className="min-w-[10rem] flex-1">
              <div className="text-sm font-medium text-slate-800">{u.name}</div>
              <div className="text-xs text-slate-500">{u.email}</div>
            </div>
            <select
              className="input w-36"
              value={u.role}
              disabled={u.id === currentUserId}
              onChange={(e) => update(u.id, { role: e.target.value })}
            >
              <option value="MEMBER">Üye</option>
              <option value="MANAGER">Yönetici</option>
              <option value="ADMIN">Admin</option>
            </select>
            <select
              className="input w-40"
              value={u.department?.id ?? ""}
              onChange={(e) => update(u.id, { departmentId: e.target.value || null })}
            >
              <option value="">Departman yok</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <div className="w-32 text-xs text-slate-500">
              {formatBytesStr(u.usedBytes)} / {formatBytesStr(u.quotaBytes)}
            </div>
            <button
              disabled={u.id === currentUserId}
              className={`btn-ghost ${u.active ? "text-red-600" : "text-emerald-600"}`}
              onClick={() => update(u.id, { active: !u.active })}
            >
              {u.active ? "Pasifleştir" : "Aktifleştir"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function DepartmentsTab({ departments, reload }: { departments: Department[]; reload: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    await fetch("/api/admin/departments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setBusy(false);
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
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {departments.map((d) => (
          <div key={d.id} className="flex items-center justify-between border-b border-slate-100 px-4 py-3 last:border-0">
            <span className="text-sm font-medium text-slate-800">{d.name}</span>
            <span className="text-xs text-slate-500">
              {d._count.users} kullanıcı · Kota: {formatBytesStr(d.quotaBytes)}
            </span>
          </div>
        ))}
        {departments.length === 0 && <p className="p-4 text-sm text-slate-400">Henüz departman yok.</p>}
      </div>
    </div>
  );
}

function AuditTab({ logs }: { logs: AuditLog[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      {logs.map((l) => (
        <div key={l.id} className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2.5 text-sm last:border-0">
          <span className="w-40 shrink-0 text-xs text-slate-400">{formatDate(l.createdAt)}</span>
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{l.action}</span>
          <span className="text-slate-600">{l.user ? l.user.name : "Anonim"}</span>
          {l.detail && <span className="truncate text-slate-400">— {l.detail}</span>}
        </div>
      ))}
      {logs.length === 0 && <p className="p-4 text-sm text-slate-400">Kayıt yok.</p>}
    </div>
  );
}
