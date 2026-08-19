"use client";

import { useEffect, useState } from "react";
import TopBar from "@/components/TopBar";
import { useToast } from "@/components/ToastProvider";
import { useMe } from "@/lib/useMe";
import { formatBytesStr, formatDate } from "@/lib/format";
import { withBasePath } from "@/lib/basePath";

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
  canCreateOrders: boolean;
  canManageOrders: boolean;
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

type Tab = "users" | "departments" | "analytics" | "settings" | "audit" | "groups" | "templates";

type GroupUser = { id: string; name: string; email: string };
type Group = { id: string; name: string; members: GroupUser[] };
type TemplateMember = { user: GroupUser | null; group: { id: string; name: string } | null };
type Template = { id: string; name: string; permission: "VIEW" | "EDIT"; members: TemplateMember[] };

const AVATAR_COLORS = ["#0f172a", "#7c3aed", "#0891b2", "#c2410c", "#15803d", "#be185d", "#4338ca"];
function avatarColor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export default function AdminPage() {
  const { user, refresh: refreshMe } = useMe();
  const [tab, setTab] = useState<Tab>("users");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadAll() {
    setError(null);
    try {
      const [u, d] = await Promise.all([
        fetch(withBasePath("/api/admin/users")).then((r) => (r.ok ? r.json() : Promise.reject(r))),
        fetch(withBasePath("/api/admin/departments")).then((r) => (r.ok ? r.json() : Promise.reject(r))),
      ]);
      setUsers(u);
      setDepartments(d);
      const l = await fetch(withBasePath("/api/admin/audit")).then((r) => (r.ok ? r.json() : []));
      setLogs(l);
      const g = await fetch(withBasePath("/api/admin/groups")).then((r) => (r.ok ? r.json() : []));
      setGroups(g);
      const t = await fetch(withBasePath("/api/admin/permission-templates")).then((r) => (r.ok ? r.json() : []));
      setTemplates(t);
    } catch {
      setError("Bu sayfayı görüntüleme yetkiniz yok.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshMe();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ilk yüklemede admin verilerini sunucudan çek
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

        <div className="mb-6 flex flex-wrap gap-1 border-b" style={{ borderColor: "var(--border)" }}>
          {(["users", "departments", "groups", "templates", "analytics", "settings", "audit"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="border-b-2 px-4 py-2 text-sm font-medium"
              style={{
                borderColor: tab === t ? "var(--accent)" : "transparent",
                color: tab === t ? "var(--text-primary)" : "var(--text-secondary)",
              }}
            >
              {t === "users"
                ? "Kullanıcılar"
                : t === "departments"
                  ? "Departmanlar"
                  : t === "groups"
                    ? "Gruplar"
                    : t === "templates"
                      ? "İzin şablonları"
                      : t === "analytics"
                        ? "Depolama analitiği"
                        : t === "settings"
                          ? "Sistem ayarları"
                          : "Etkinlik günlüğü"}
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
        {!loading && !error && tab === "groups" && <GroupsTab groups={groups} reload={loadAll} />}
        {!loading && !error && tab === "templates" && (
          <TemplatesTab templates={templates} groups={groups} reload={loadAll} />
        )}
        {!loading && !error && tab === "analytics" && <AnalyticsTab users={users} departments={departments} />}
        {!loading && !error && tab === "settings" && <SettingsTab />}
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
    const res = await fetch(withBasePath("/api/admin/users"), {
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
    const res = await fetch(withBasePath(`/api/admin/users/${id}`), {
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
            <div key={u.id} className="border-b px-4 py-4 last:border-0" style={{ borderColor: "var(--border)" }}>
              <div className="mb-3 flex items-center gap-3">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                  style={{ background: avatarColor(u.email) }}
                >
                  {u.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-[10rem] flex-1">
                  <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {u.name}
                    {!u.active && (
                      <span className="ml-2 text-xs font-normal" style={{ color: "var(--danger)" }}>
                        (pasif)
                      </span>
                    )}
                  </div>
                  <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    {u.email}
                  </div>
                </div>
                <button
                  disabled={u.id === currentUserId}
                  className={`btn-ghost shrink-0 ${u.active ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}
                  onClick={() => update(u.id, { active: !u.active }, u.active ? "Kullanıcı pasifleştirildi" : "Kullanıcı aktifleştirildi")}
                >
                  {u.active ? "Pasifleştir" : "Aktifleştir"}
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                    Rol
                  </span>
                  <select
                    className="input w-full"
                    value={u.role}
                    disabled={u.id === currentUserId}
                    onChange={(e) => update(u.id, { role: e.target.value }, "Rol güncellendi")}
                  >
                    <option value="MEMBER">Üye</option>
                    <option value="MANAGER">Yönetici</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                    Departman
                  </span>
                  <select
                    className="input w-full"
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
                </label>

                <div className="block">
                  <span className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                    Sipariş yetkisi
                  </span>
                  <div className="flex flex-col gap-1 pt-1.5 text-xs" style={{ color: "var(--text-primary)" }}>
                    <label className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5"
                        checked={u.canCreateOrders}
                        onChange={(e) => update(u.id, { canCreateOrders: e.target.checked }, "Sipariş oluşturma yetkisi güncellendi")}
                      />
                      Oluşturabilir (pazarlama)
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5"
                        checked={u.canManageOrders}
                        onChange={(e) => update(u.id, { canManageOrders: e.target.checked }, "Sipariş yönetme yetkisi güncellendi")}
                      />
                      Yönetebilir (muhasebe)
                    </label>
                  </div>
                </div>

                <div className="block">
                  <span className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                    Depolama kotası
                  </span>
                  <div className="mb-1 flex justify-between text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    <span>{formatBytesStr(u.usedBytes)}</span>
                    <span>/ {formatBytesStr(u.quotaBytes)}</span>
                  </div>
                  <div className="mb-1.5 h-1.5 w-full rounded-full" style={{ background: "var(--surface-muted)" }}>
                    <div
                      className="h-1.5 rounded-full transition-all"
                      style={{ width: `${usedPct}%`, background: usedPct > 90 ? "var(--danger)" : "var(--accent)" }}
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0.1}
                      step={0.5}
                      placeholder={quotaGb(u.quotaBytes)}
                      className="input min-w-0 flex-1 px-2 py-1 text-xs"
                      value={quotaDrafts[u.id] ?? ""}
                      onChange={(e) => setQuotaDrafts((d) => ({ ...d, [u.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveQuota(u.id);
                      }}
                    />
                    <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                      GB
                    </span>
                    <button className="btn-ghost shrink-0 text-xs" onClick={() => saveQuota(u.id)}>
                      Kaydet
                    </button>
                  </div>
                </div>
              </div>
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
    const res = await fetch(withBasePath("/api/admin/departments"), {
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
                  const res = await fetch(withBasePath(`/api/admin/departments/${d.id}`), {
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

function GroupsTab({ groups, reload }: { groups: Group[]; reload: () => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [emailDrafts, setEmailDrafts] = useState<Record<string, string>>({});

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const res = await fetch(withBasePath("/api/admin/groups"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast(d.error ?? "Grup oluşturulamadı", "error");
      return;
    }
    toast(`"${name}" grubu eklendi`, "success");
    setName("");
    reload();
  }

  async function remove(id: string, groupName: string) {
    await fetch(withBasePath(`/api/admin/groups/${id}`), { method: "DELETE" });
    toast(`"${groupName}" grubu silindi`);
    reload();
  }

  async function addMember(groupId: string) {
    const email = (emailDrafts[groupId] ?? "").trim();
    if (!email) return;
    const res = await fetch(withBasePath(`/api/admin/groups/${groupId}/members`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userEmail: email }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast(d.error ?? "Eklenemedi", "error");
      return;
    }
    setEmailDrafts((d) => ({ ...d, [groupId]: "" }));
    reload();
  }

  async function removeMember(groupId: string, userId: string) {
    await fetch(withBasePath(`/api/admin/groups/${groupId}/members/${userId}`), { method: "DELETE" });
    reload();
  }

  return (
    <div>
      <form onSubmit={create} className="mb-6 flex gap-2">
        <input className="input" placeholder="Grup adı (ör. Pazarlama)" value={name} onChange={(e) => setName(e.target.value)} />
        <button disabled={busy} className="btn-primary shrink-0">
          + Ekle
        </button>
      </form>
      <div className="space-y-3">
        {groups.map((g) => (
          <div key={g.id} className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                {g.name}
              </h3>
              <button className="btn-ghost text-xs text-red-600 dark:text-red-400" onClick={() => remove(g.id, g.name)}>
                Grubu sil
              </button>
            </div>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {g.members.map((m) => (
                <span key={m.id} className="badge flex items-center gap-1">
                  {m.name}
                  <button className="text-red-600 dark:text-red-400" onClick={() => removeMember(g.id, m.id)}>
                    ×
                  </button>
                </span>
              ))}
              {g.members.length === 0 && (
                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  Henüz üye yok.
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="kullanici@sirket.com"
                className="input px-2 py-1 text-xs"
                value={emailDrafts[g.id] ?? ""}
                onChange={(e) => setEmailDrafts((d) => ({ ...d, [g.id]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addMember(g.id);
                }}
              />
              <button className="btn-ghost text-xs" onClick={() => addMember(g.id)}>
                Üye ekle
              </button>
            </div>
          </div>
        ))}
        {groups.length === 0 && (
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
            Henüz grup yok.
          </p>
        )}
      </div>
    </div>
  );
}

function TemplatesTab({
  templates,
  groups,
  reload,
}: {
  templates: Template[];
  groups: Group[];
  reload: () => void;
}) {
  const toast = useToast();
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [permission, setPermission] = useState<"VIEW" | "EDIT">("VIEW");
  const [emails, setEmails] = useState("");
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  function toggleGroup(id: string) {
    setSelectedGroups((s) => (s.includes(id) ? s.filter((g) => g !== id) : [...s, id]));
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const userEmails = emails
      .split(/[,\s]+/)
      .map((e) => e.trim())
      .filter(Boolean);
    const res = await fetch(withBasePath("/api/admin/permission-templates"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, permission, userEmails, groupIds: selectedGroups }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast(d.error ?? "Şablon oluşturulamadı", "error");
      return;
    }
    toast(`"${name}" şablonu eklendi`, "success");
    setName("");
    setEmails("");
    setSelectedGroups([]);
    setShowNew(false);
    reload();
  }

  async function remove(id: string, templateName: string) {
    await fetch(withBasePath(`/api/admin/permission-templates/${id}`), { method: "DELETE" });
    toast(`"${templateName}" şablonu silindi`);
    reload();
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button className="btn-primary" onClick={() => setShowNew((s) => !s)}>
          {showNew ? "Vazgeç" : "+ Yeni şablon"}
        </button>
      </div>

      {showNew && (
        <form onSubmit={create} className="card mb-6 space-y-3 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input required placeholder="Şablon adı (ör. Sadece görüntüleme)" className="input" value={name} onChange={(e) => setName(e.target.value)} />
            <select className="input" value={permission} onChange={(e) => setPermission(e.target.value as "VIEW" | "EDIT")}>
              <option value="VIEW">Görüntüle</option>
              <option value="EDIT">Düzenle</option>
            </select>
          </div>
          <input
            placeholder="E-posta adresleri (virgülle ayır)"
            className="input"
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
          />
          {groups.length > 0 && (
            <div>
              <span className="mb-1.5 block text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                Gruplar
              </span>
              <div className="flex flex-wrap gap-1.5">
                {groups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => toggleGroup(g.id)}
                    className="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
                    style={
                      selectedGroups.includes(g.id)
                        ? { background: "var(--accent)", color: "var(--accent-foreground)", borderColor: "var(--accent)" }
                        : { background: "var(--surface)", color: "var(--text-secondary)", borderColor: "var(--border)" }
                    }
                  >
                    {g.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button disabled={busy} className="btn-primary">
            Oluştur
          </button>
        </form>
      )}

      <div className="space-y-3">
        {templates.map((t) => (
          <div key={t.id} className="card flex items-start justify-between gap-3 p-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  {t.name}
                </h3>
                <span className="badge">{t.permission === "EDIT" ? "Düzenle" : "Görüntüle"}</span>
              </div>
              <p className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                {t.members
                  .map((m) => m.user?.name ?? (m.group ? `👥 ${m.group.name}` : null))
                  .filter(Boolean)
                  .join(", ") || "Üye yok"}
              </p>
            </div>
            <button className="btn-ghost text-xs text-red-600 dark:text-red-400" onClick={() => remove(t.id, t.name)}>
              Sil
            </button>
          </div>
        ))}
        {templates.length === 0 && (
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
            Henüz şablon yok.
          </p>
        )}
      </div>
    </div>
  );
}

function AnalyticsTab({ users, departments }: { users: AdminUser[]; departments: Department[] }) {
  const totalUsed = users.reduce((sum, u) => sum + Number(u.usedBytes), 0);
  const totalQuota = users.reduce((sum, u) => sum + Number(u.quotaBytes), 0);

  const byDept = departments.map((d) => {
    const deptUsers = users.filter((u) => u.department?.id === d.id);
    const used = deptUsers.reduce((sum, u) => sum + Number(u.usedBytes), 0);
    return { id: d.id, name: d.name, used, quota: Number(d.quotaBytes), userCount: deptUsers.length };
  });
  const noDeptUsed = users.filter((u) => !u.department).reduce((sum, u) => sum + Number(u.usedBytes), 0);

  const topUsers = [...users].sort((a, b) => Number(b.usedBytes) - Number(a.usedBytes)).slice(0, 8);
  const maxUserUsage = Math.max(1, ...topUsers.map((u) => Number(u.usedBytes)));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="card p-4">
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Toplam kullanılan alan
          </p>
          <p className="mt-1 text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
            {formatBytesStr(totalUsed)}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Toplam tanımlı kota
          </p>
          <p className="mt-1 text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
            {formatBytesStr(totalQuota)}
          </p>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          Departmana göre kullanım
        </h3>
        <div className="card space-y-4 p-4">
          {byDept.map((d) => {
            const pct = Math.min(100, Math.round((d.used / Math.max(d.quota, 1)) * 100));
            return (
              <div key={d.id}>
                <div className="mb-1 flex justify-between text-xs" style={{ color: "var(--text-secondary)" }}>
                  <span>
                    {d.name} · {d.userCount} kullanıcı
                  </span>
                  <span>
                    {formatBytesStr(d.used)} / {formatBytesStr(d.quota)}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full" style={{ background: "var(--surface-muted)" }}>
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{ width: `${pct}%`, background: pct > 90 ? "var(--danger)" : "var(--accent)" }}
                  />
                </div>
              </div>
            );
          })}
          {noDeptUsed > 0 && (
            <div>
              <div className="mb-1 flex justify-between text-xs" style={{ color: "var(--text-secondary)" }}>
                <span>Departmansız kullanıcılar</span>
                <span>{formatBytesStr(noDeptUsed)}</span>
              </div>
              <div className="h-2 w-full rounded-full" style={{ background: "var(--surface-muted)" }}>
                <div className="h-2 rounded-full" style={{ width: "100%", background: "var(--text-tertiary)" }} />
              </div>
            </div>
          )}
          {byDept.length === 0 && noDeptUsed === 0 && (
            <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
              Henüz veri yok.
            </p>
          )}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          En çok yer kaplayan kullanıcılar
        </h3>
        <div className="card space-y-3 p-4">
          {topUsers.map((u) => {
            const used = Number(u.usedBytes);
            const barPct = Math.round((used / maxUserUsage) * 100);
            return (
              <div key={u.id} className="flex items-center gap-3">
                <span className="w-32 shrink-0 truncate text-xs" style={{ color: "var(--text-primary)" }}>
                  {u.name}
                </span>
                <div className="h-2 flex-1 rounded-full" style={{ background: "var(--surface-muted)" }}>
                  <div className="h-2 rounded-full" style={{ width: `${barPct}%`, background: "var(--accent)" }} />
                </div>
                <span className="w-16 shrink-0 text-right text-xs" style={{ color: "var(--text-secondary)" }}>
                  {formatBytesStr(used)}
                </span>
              </div>
            );
          })}
          {topUsers.length === 0 && (
            <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
              Henüz kullanıcı yok.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

type SystemSettingsData = {
  trashRetentionDays: number | null;
  versionRetentionDays: number | null;
  maxFileSizeBytes: string | null;
  blockedExtensions: string | null;
  uiSkin: "modern" | "archive";
};

function SettingsTab() {
  const toast = useToast();
  const [settings, setSettings] = useState<SystemSettingsData | null>(null);
  const [trashDays, setTrashDays] = useState("");
  const [versionDays, setVersionDays] = useState("");
  const [maxSizeMb, setMaxSizeMb] = useState("");
  const [blockedExt, setBlockedExt] = useState("");
  const [uiSkin, setUiSkin] = useState<"modern" | "archive">("modern");
  const [busy, setBusy] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<string | null>(null);

  function load() {
    fetch(withBasePath("/api/admin/settings"))
      .then((r) => r.json())
      .then((d: SystemSettingsData) => {
        setSettings(d);
        setTrashDays(d.trashRetentionDays?.toString() ?? "");
        setVersionDays(d.versionRetentionDays?.toString() ?? "");
        setMaxSizeMb(d.maxFileSizeBytes ? (Number(d.maxFileSizeBytes) / 1024 ** 2).toString() : "");
        setBlockedExt(d.blockedExtensions ?? "");
        setUiSkin(d.uiSkin ?? "modern");
      });
  }

  async function saveSkin(skin: "modern" | "archive") {
    setUiSkin(skin);
    const res = await fetch(withBasePath("/api/admin/settings"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uiSkin: skin }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast(d.error ?? "Kaydedilemedi", "error");
      return;
    }
    toast(
      skin === "archive"
        ? "Arayüz görünümü \"Kurumsal Arşiv Dosya Dolabı\" olarak ayarlandı"
        : "Arayüz görünümü \"Modern\" olarak ayarlandı",
      "success"
    );
  }

  useEffect(() => {
    load();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch(withBasePath("/api/admin/settings"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trashRetentionDays: trashDays ? Number(trashDays) : null,
        versionRetentionDays: versionDays ? Number(versionDays) : null,
        maxFileSizeBytes: maxSizeMb ? Math.round(Number(maxSizeMb) * 1024 ** 2) : null,
        blockedExtensions: blockedExt.trim() || null,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast(d.error ?? "Kaydedilemedi", "error");
      return;
    }
    toast("Ayarlar kaydedildi", "success");
    load();
  }

  async function runNow() {
    setBusy(true);
    setCleanupResult(null);
    const res = await fetch(withBasePath("/api/admin/cleanup"), { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast(d.error ?? "Çalıştırılamadı", "error");
      return;
    }
    const d = await res.json();
    setCleanupResult(
      `${d.purgedFolders} klasör, ${d.purgedFiles} dosya, ${d.purgedVersions} versiyon kalıcı silindi; ${d.overdueOrdersNotified ?? 0} vadesi geçmiş sipariş hatırlatması gönderildi.`
    );
    toast("Temizlik tamamlandı", "success");
  }

  if (!settings) return <div className="skeleton h-40 w-full" />;

  return (
    <div className="space-y-6">
      <div className="card space-y-4 p-5">
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Arayüz görünümü
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            Sürücü sayfasının görsel dilini seç — tüm kullanıcılar için geçerli olur. İkisi de tam
            işlevsel, sadece görünüm değişir.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => saveSkin("modern")}
            className="rounded-xl border p-4 text-left transition-colors"
            style={
              uiSkin === "modern"
                ? { borderColor: "var(--accent)", background: "var(--accent-soft)" }
                : { borderColor: "var(--border)" }
            }
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">🗂️</span>
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                Modern
              </span>
              {uiSkin === "modern" && <span className="badge">Aktif</span>}
            </div>
            <p className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
              Mevcut varsayılan görünüm — indigo/mor vurgu, düz kartlar.
            </p>
          </button>
          <button
            type="button"
            onClick={() => saveSkin("archive")}
            className="rounded-xl border p-4 text-left transition-colors"
            style={
              uiSkin === "archive"
                ? { borderColor: "var(--accent)", background: "var(--accent-soft)" }
                : { borderColor: "var(--border)" }
            }
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">🗄️</span>
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                Kurumsal Arşiv Dosya Dolabı
              </span>
              {uiSkin === "archive" && <span className="badge">Aktif</span>}
            </div>
            <p className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
              Kraft/pirinç tonlarında, klasörler asma dosya sekmesi gibi görünür.
            </p>
          </button>
        </div>
      </div>

      <form onSubmit={save} className="card space-y-4 p-5">
        <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          Otomatik veri temizleme
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium" style={{ color: "var(--text-primary)" }}>
              Çöp kutusu saklama süresi (gün)
            </span>
            <input
              type="number"
              min={1}
              placeholder="Kapalı (hiç silinmez)"
              className="input"
              value={trashDays}
              onChange={(e) => setTrashDays(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium" style={{ color: "var(--text-primary)" }}>
              Eski versiyon saklama süresi (gün)
            </span>
            <input
              type="number"
              min={1}
              placeholder="Kapalı (hiç silinmez)"
              className="input"
              value={versionDays}
              onChange={(e) => setVersionDays(e.target.value)}
            />
          </label>
        </div>
        <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          Boş bırakılırsa o politika devre dışı kalır. Güncel (current) dosya versiyonu asla silinmez.
        </p>

        <h2 className="pt-2 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          Dosya yükleme politikaları
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium" style={{ color: "var(--text-primary)" }}>
              Maksimum dosya boyutu (MB)
            </span>
            <input
              type="number"
              min={1}
              placeholder="Sınırsız"
              className="input"
              value={maxSizeMb}
              onChange={(e) => setMaxSizeMb(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium" style={{ color: "var(--text-primary)" }}>
              Engellenen uzantılar
            </span>
            <input
              type="text"
              placeholder=".exe, .bat, .sh"
              className="input"
              value={blockedExt}
              onChange={(e) => setBlockedExt(e.target.value)}
            />
          </label>
        </div>

        <button disabled={busy} className="btn-primary">
          Ayarları kaydet
        </button>
      </form>

      <div className="card p-5">
        <h2 className="mb-1 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          Temizliği şimdi çalıştır
        </h2>
        <p className="mb-3 text-sm" style={{ color: "var(--text-secondary)" }}>
          Kaydedilmiş politikayı hemen uygular — beklemeden test etmek için. cPanel&apos;de bir Cron Job kurup{" "}
          <code className="text-xs">POST /api/admin/cleanup</code> adresine <code className="text-xs">Authorization: Bearer CRON_SECRET</code>{" "}
          ile günlük istek atarak otomatikleştirebilirsiniz (README&apos;ye bakın).
        </p>
        <button disabled={busy} className="btn-secondary" onClick={runNow}>
          Şimdi çalıştır
        </button>
        {cleanupResult && (
          <p className="mt-3 text-sm" style={{ color: "var(--text-secondary)" }}>
            {cleanupResult}
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
          <span className="badge font-mono">{l.action}</span>
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
