"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import TopBar from "@/components/TopBar";
import ShareDialog from "@/components/ShareDialog";
import VersionsDialog from "@/components/VersionsDialog";
import PreviewDialog from "@/components/PreviewDialog";
import MoveDialog from "@/components/MoveDialog";
import RowMenu from "@/components/RowMenu";
import { InputDialog, ConfirmDialog } from "@/components/Dialogs";
import { useToast } from "@/components/ToastProvider";
import type { Crumb, FileItem, FolderItem, MeUser } from "@/lib/types";
import { badgeColorForMime, formatBytesStr, formatDate, iconForMime, previewKind } from "@/lib/format";

type View = "root" | "shared" | "search";
type PendingAction =
  | { kind: "new-folder" }
  | { kind: "rename-folder"; folder: FolderItem }
  | { kind: "delete-folder"; folder: FolderItem }
  | { kind: "rename-file"; file: FileItem }
  | { kind: "delete-file"; file: FileItem }
  | { kind: "move-folder"; folder: FolderItem }
  | { kind: "move-file"; file: FileItem };

function DriveInner() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const folderId = params.get("folder");
  const view: View = params.get("view") === "shared" ? "shared" : params.get("q") ? "search" : "root";
  const q = params.get("q") ?? "";

  const [user, setUser] = useState<MeUser | null>(null);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<Crumb[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState<{ type: "file" | "folder"; id: string; name: string } | null>(null);
  const [versionsTarget, setVersionsTarget] = useState<{ id: string; name: string } | null>(null);
  const [previewTarget, setPreviewTarget] = useState<{ id: string; name: string; mimeType: string } | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshMe = useCallback(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (view === "search") {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setFolders([]);
        setFiles(data.files ?? []);
        setBreadcrumb([]);
      } else if (view === "shared") {
        const res = await fetch("/api/shared-with-me");
        const data = await res.json();
        setFolders(data.folders ?? []);
        setFiles(data.files ?? []);
        setBreadcrumb([]);
      } else {
        const qs = folderId ? `?parentId=${folderId}` : "";
        const res = await fetch(`/api/folders${qs}`);
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error ?? "Yüklenemedi");
        }
        const data = await res.json();
        setFolders(data.folders ?? []);
        setFiles(data.files ?? []);
        setBreadcrumb(data.breadcrumb ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bir hata oluştu");
    } finally {
      setLoading(false);
    }
  }, [folderId, view, q]);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- veri klasör/görünüm değiştiğinde sunucudan yeniden çekilir
    load();
    setSidebarOpen(false);
  }, [load]);

  function goFolder(id: string | null) {
    router.push(id ? `/drive?folder=${id}` : "/drive");
  }

  function goShared() {
    router.push("/drive?view=shared");
  }

  function doSearch(query: string) {
    if (!query.trim()) router.push("/drive");
    else router.push(`/drive?q=${encodeURIComponent(query)}`);
  }

  async function createFolder(name: string) {
    setPending(null);
    const res = await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, parentId: folderId }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast(d.error ?? "Klasör oluşturulamadı", "error");
      return;
    }
    toast(`"${name}" klasörü oluşturuldu`, "success");
    load();
  }

  async function uploadFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    let ok = 0;
    for (const file of Array.from(fileList)) {
      const fd = new FormData();
      fd.append("file", file);
      if (folderId) fd.append("folderId", folderId);
      const res = await fetch("/api/files", { method: "POST", body: fd });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast(`${file.name}: ${d.error ?? "yüklenemedi"}`, "error");
      } else {
        ok++;
      }
    }
    if (ok > 0) toast(ok === 1 ? "Dosya yüklendi" : `${ok} dosya yüklendi`, "success");
    load();
    refreshMe();
  }

  async function submitRenameFolder(folder: FolderItem, name: string) {
    setPending(null);
    if (name === folder.name) return;
    await fetch(`/api/folders/${folder.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    load();
  }

  async function confirmDeleteFolder(folder: FolderItem) {
    setPending(null);
    const res = await fetch(`/api/folders/${folder.id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast(d.error ?? "Silinemedi", "error");
      return;
    }
    toast("Klasör silindi");
    load();
  }

  async function submitRenameFile(file: FileItem, name: string) {
    setPending(null);
    if (name === file.name) return;
    await fetch(`/api/files/${file.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    load();
  }

  async function confirmDeleteFile(file: FileItem) {
    setPending(null);
    const res = await fetch(`/api/files/${file.id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast(d.error ?? "Silinemedi", "error");
      return;
    }
    toast("Dosya silindi");
    load();
    refreshMe();
  }

  function downloadFile(f: FileItem) {
    window.open(`/api/files/${f.id}`, "_blank");
  }

  function openFile(f: FileItem) {
    if (previewKind(f.mimeType) === "none") {
      downloadFile(f);
    } else {
      setPreviewTarget({ id: f.id, name: f.name, mimeType: f.mimeType });
    }
  }

  async function submitMoveFolder(folder: FolderItem, destFolderId: string | null) {
    setPending(null);
    const res = await fetch(`/api/folders/${folder.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId: destFolderId }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast(d.error ?? "Taşınamadı", "error");
      return;
    }
    toast("Taşındı", "success");
    load();
  }

  async function submitMoveFile(file: FileItem, destFolderId: string | null) {
    setPending(null);
    const res = await fetch(`/api/files/${file.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId: destFolderId }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast(d.error ?? "Taşınamadı", "error");
      return;
    }
    toast("Taşındı", "success");
    load();
  }

  if (!user) return null;

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar user={user} onSearch={doSearch} onMenuClick={() => setSidebarOpen(true)} />

      <div className="flex flex-1">
        {sidebarOpen && (
          <div className="fixed inset-0 z-30 bg-slate-900/40 sm:hidden" onClick={() => setSidebarOpen(false)} />
        )}
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-56 shrink-0 border-r p-4 transition-transform sm:static sm:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <nav className="space-y-1">
            <SideLink active={view === "root"} onClick={() => goFolder(null)} label="Sürücüm" icon="🗂️" />
            <SideLink active={view === "shared"} onClick={goShared} label="Benimle paylaşılanlar" icon="🤝" />
          </nav>
        </aside>

        <main className="flex-1 p-4 sm:p-6">
          {view === "root" && (
            <div className="mb-4 flex flex-wrap items-center gap-1 text-sm" style={{ color: "var(--text-secondary)" }}>
              <button onClick={() => goFolder(null)} className="hover:underline" style={{ color: "inherit" }}>
                Sürücüm
              </button>
              {breadcrumb.map((c) => (
                <span key={c.id} className="flex items-center gap-1">
                  <span>/</span>
                  <button onClick={() => goFolder(c.id)} className="hover:underline">
                    {c.name}
                  </button>
                </span>
              ))}
            </div>
          )}

          {view === "search" && (
            <h1 className="mb-4 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              &quot;{q}&quot; için sonuçlar
            </h1>
          )}
          {view === "shared" && (
            <h1 className="mb-4 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              Benimle paylaşılanlar
            </h1>
          )}

          {view === "root" && (
            <div className="mb-5 flex gap-2">
              <button className="btn-secondary" onClick={() => setPending({ kind: "new-folder" })}>
                + Yeni klasör
              </button>
              <button className="btn-primary" onClick={() => fileInputRef.current?.click()}>
                ⬆ Dosya yükle
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => uploadFiles(e.target.files)}
              />
            </div>
          )}

          {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

          {loading && (
            <div className="card overflow-hidden">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 border-b px-4 py-3 last:border-0" style={{ borderColor: "var(--border)" }}>
                  <div className="skeleton h-6 w-6 rounded" />
                  <div className="skeleton h-4 flex-1 max-w-[12rem]" />
                  <div className="skeleton h-3 w-16" />
                </div>
              ))}
            </div>
          )}

          {!loading && folders.length === 0 && files.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-16 text-center" style={{ borderColor: "var(--border)" }}>
              <span className="text-3xl">{view === "shared" ? "🤝" : view === "search" ? "🔍" : "📂"}</span>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {view === "shared"
                  ? "Henüz sizinle paylaşılan bir şey yok."
                  : view === "search"
                    ? "Sonuç bulunamadı."
                    : "Bu klasör boş."}
              </p>
            </div>
          )}

          {!loading && (folders.length > 0 || files.length > 0) && (
            <div className="card overflow-hidden">
              {folders.map((f) => (
                <div
                  key={f.id}
                  className="group flex flex-wrap items-center gap-3 border-b px-4 py-3 transition-colors last:border-0"
                  style={{ borderColor: "var(--border)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <button
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    onClick={() => (view === "shared" ? router.push(`/drive?folder=${f.id}`) : goFolder(f.id))}
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg"
                      style={{ background: "var(--accent-soft)" }}
                    >
                      📁
                    </span>
                    <span className="truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      {f.name}
                    </span>
                  </button>
                  <span className="hidden text-xs sm:inline" style={{ color: "var(--text-tertiary)" }}>
                    {formatDate(f.updatedAt)}
                  </span>
                  <RowActions>
                    <button className="btn-ghost" onClick={() => setShareTarget({ type: "folder", id: f.id, name: f.name })}>
                      Paylaş
                    </button>
                    {view === "root" && (
                      <>
                        <button className="btn-ghost" onClick={() => setPending({ kind: "move-folder", folder: f })}>
                          Taşı
                        </button>
                        <button className="btn-ghost" onClick={() => setPending({ kind: "rename-folder", folder: f })}>
                          Yeniden adlandır
                        </button>
                        <button className="btn-ghost text-red-600 dark:text-red-400" onClick={() => setPending({ kind: "delete-folder", folder: f })}>
                          Sil
                        </button>
                      </>
                    )}
                  </RowActions>
                  <div className="sm:hidden">
                    <RowMenu
                      items={[
                        { label: "Paylaş", onClick: () => setShareTarget({ type: "folder", id: f.id, name: f.name }) },
                        ...(view === "root"
                          ? [
                              { label: "Taşı", onClick: () => setPending({ kind: "move-folder" as const, folder: f }) },
                              { label: "Yeniden adlandır", onClick: () => setPending({ kind: "rename-folder" as const, folder: f }) },
                              { label: "Sil", onClick: () => setPending({ kind: "delete-folder" as const, folder: f }), danger: true },
                            ]
                          : []),
                      ]}
                    />
                  </div>
                </div>
              ))}

              {files.map((f) => (
                <div
                  key={f.id}
                  className="flex flex-wrap items-center gap-3 border-b px-4 py-3 transition-colors last:border-0"
                  style={{ borderColor: "var(--border)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => openFile(f)}>
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg"
                      style={{ background: `${badgeColorForMime(f.mimeType)}1f` }}
                    >
                      {iconForMime(f.mimeType)}
                    </span>
                    <span className="truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      {f.name}
                    </span>
                  </button>
                  <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                    {formatBytesStr(f.size)}
                  </span>
                  <span className="hidden text-xs sm:inline" style={{ color: "var(--text-tertiary)" }}>
                    {formatDate(f.updatedAt)}
                  </span>
                  <RowActions>
                    <button className="btn-ghost" onClick={() => downloadFile(f)}>
                      İndir
                    </button>
                    <button className="btn-ghost" onClick={() => setShareTarget({ type: "file", id: f.id, name: f.name })}>
                      Paylaş
                    </button>
                    <button className="btn-ghost" onClick={() => setVersionsTarget({ id: f.id, name: f.name })}>
                      Versiyonlar
                    </button>
                    {view === "root" && (
                      <>
                        <button className="btn-ghost" onClick={() => setPending({ kind: "move-file", file: f })}>
                          Taşı
                        </button>
                        <button className="btn-ghost" onClick={() => setPending({ kind: "rename-file", file: f })}>
                          Yeniden adlandır
                        </button>
                        <button className="btn-ghost text-red-600 dark:text-red-400" onClick={() => setPending({ kind: "delete-file", file: f })}>
                          Sil
                        </button>
                      </>
                    )}
                  </RowActions>
                  <div className="sm:hidden">
                    <RowMenu
                      items={[
                        { label: "İndir", onClick: () => downloadFile(f) },
                        { label: "Paylaş", onClick: () => setShareTarget({ type: "file", id: f.id, name: f.name }) },
                        { label: "Versiyonlar", onClick: () => setVersionsTarget({ id: f.id, name: f.name }) },
                        ...(view === "root"
                          ? [
                              { label: "Taşı", onClick: () => setPending({ kind: "move-file" as const, file: f }) },
                              { label: "Yeniden adlandır", onClick: () => setPending({ kind: "rename-file" as const, file: f }) },
                              { label: "Sil", onClick: () => setPending({ kind: "delete-file" as const, file: f }), danger: true },
                            ]
                          : []),
                      ]}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {shareTarget && (
        <ShareDialog
          targetType={shareTarget.type}
          targetId={shareTarget.id}
          targetName={shareTarget.name}
          onClose={() => setShareTarget(null)}
        />
      )}
      {versionsTarget && (
        <VersionsDialog
          fileId={versionsTarget.id}
          fileName={versionsTarget.name}
          onClose={() => setVersionsTarget(null)}
          onRestored={load}
        />
      )}
      {previewTarget && (
        <PreviewDialog
          fileId={previewTarget.id}
          fileName={previewTarget.name}
          mimeType={previewTarget.mimeType}
          onClose={() => setPreviewTarget(null)}
        />
      )}

      {pending?.kind === "new-folder" && (
        <InputDialog
          title="Yeni klasör"
          label="Klasör adı"
          confirmLabel="Oluştur"
          onConfirm={createFolder}
          onCancel={() => setPending(null)}
        />
      )}
      {pending?.kind === "rename-folder" && (
        <InputDialog
          title="Klasörü yeniden adlandır"
          label="Yeni ad"
          initialValue={pending.folder.name}
          onConfirm={(name) => submitRenameFolder(pending.folder, name)}
          onCancel={() => setPending(null)}
        />
      )}
      {pending?.kind === "rename-file" && (
        <InputDialog
          title="Dosyayı yeniden adlandır"
          label="Yeni ad"
          initialValue={pending.file.name}
          onConfirm={(name) => submitRenameFile(pending.file, name)}
          onCancel={() => setPending(null)}
        />
      )}
      {pending?.kind === "delete-folder" && (
        <ConfirmDialog
          title="Klasörü sil"
          description={`"${pending.folder.name}" klasörü ve içeriği silinecek. Bu işlem geri alınamaz.`}
          onConfirm={() => confirmDeleteFolder(pending.folder)}
          onCancel={() => setPending(null)}
        />
      )}
      {pending?.kind === "delete-file" && (
        <ConfirmDialog
          title="Dosyayı sil"
          description={`"${pending.file.name}" silinecek. Bu işlem geri alınamaz.`}
          onConfirm={() => confirmDeleteFile(pending.file)}
          onCancel={() => setPending(null)}
        />
      )}
      {pending?.kind === "move-folder" && (
        <MoveDialog
          itemName={pending.folder.name}
          excludeFolderId={pending.folder.id}
          onSelect={(dest) => submitMoveFolder(pending.folder, dest)}
          onClose={() => setPending(null)}
        />
      )}
      {pending?.kind === "move-file" && (
        <MoveDialog
          itemName={pending.file.name}
          onSelect={(dest) => submitMoveFile(pending.file, dest)}
          onClose={() => setPending(null)}
        />
      )}
    </div>
  );
}

function SideLink({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors"
      style={
        active
          ? { background: "var(--accent-soft)", color: "var(--accent-soft-foreground)" }
          : { color: "var(--text-primary)" }
      }
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "var(--surface-hover)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}
    >
      <span>{icon}</span>
      {label}
    </button>
  );
}

function RowActions({ children }: { children: React.ReactNode }) {
  return <div className="hidden shrink-0 items-center gap-1 sm:flex">{children}</div>;
}

export default function DrivePage() {
  return (
    <Suspense>
      <DriveInner />
    </Suspense>
  );
}
