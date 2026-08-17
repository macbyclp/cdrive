"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import TopBar from "@/components/TopBar";
import ShareDialog from "@/components/ShareDialog";
import VersionsDialog from "@/components/VersionsDialog";
import PreviewDialog from "@/components/PreviewDialog";
import MoveDialog from "@/components/MoveDialog";
import RowMenu, { type RowMenuItem } from "@/components/RowMenu";
import { InputDialog, ConfirmDialog } from "@/components/Dialogs";
import { useToast } from "@/components/ToastProvider";
import { useMe } from "@/lib/useMe";
import type { Crumb, FileItem, FolderItem } from "@/lib/types";
import { badgeColorForMime, extOf, formatBytesStr, formatDate, iconForMime, officeDocType, previewKind } from "@/lib/format";
import { withBasePath } from "@/lib/basePath";

type View = "root" | "shared" | "search" | "recent" | "starred" | "trash" | "media";
type ViewMode = "list" | "grid";
const VIEW_MODE_KEY = "cdrive-view-mode";
type PendingAction =
  | { kind: "new-folder" }
  | { kind: "rename-folder"; folder: FolderItem }
  | { kind: "delete-folder"; folder: FolderItem }
  | { kind: "rename-file"; file: FileItem }
  | { kind: "delete-file"; file: FileItem }
  | { kind: "move-folder"; folder: FolderItem }
  | { kind: "move-file"; file: FileItem }
  | { kind: "purge-folder"; folder: FolderItem }
  | { kind: "purge-file"; file: FileItem }
  | { kind: "bulk-delete" }
  | { kind: "bulk-move" };

function selKey(type: "file" | "folder", id: string) {
  return `${type}:${id}`;
}

function DriveInner() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const folderId = params.get("folder");
  const view: View =
    params.get("view") === "shared"
      ? "shared"
      : params.get("view") === "recent"
        ? "recent"
        : params.get("view") === "starred"
          ? "starred"
          : params.get("view") === "trash"
            ? "trash"
            : params.get("view") === "media"
              ? "media"
              : params.get("q")
                ? "search"
                : "root";
  const q = params.get("q") ?? "";
  const canBulk = view === "root";

  const { user, refresh: refreshMe } = useMe();
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
  const [viewMode, setViewModeState] = useState<ViewMode>("list");
  const [starredFileIds, setStarredFileIds] = useState<Set<string>>(new Set());
  const [starredFolderIds, setStarredFolderIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const newMenuRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [draggedItem, setDraggedItem] = useState<{ type: "file" | "folder"; id: string } | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem(VIEW_MODE_KEY) as ViewMode | null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount sonrası localStorage'dan tek seferlik senkronizasyon
    if (stored === "list" || stored === "grid") setViewModeState(stored);
  }, []);

  function setViewMode(mode: ViewMode) {
    setViewModeState(mode);
    localStorage.setItem(VIEW_MODE_KEY, mode);
  }

  const loadStars = useCallback(() => {
    fetch(withBasePath("/api/stars/ids"))
      .then((r) => r.json())
      .then((d) => {
        setStarredFileIds(new Set(d.fileIds ?? []));
        setStarredFolderIds(new Set(d.folderIds ?? []));
      });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (view === "search") {
        const res = await fetch(withBasePath(`/api/search?q=${encodeURIComponent(q)}`));
        const data = await res.json();
        setFolders([]);
        setFiles(data.files ?? []);
        setBreadcrumb([]);
      } else if (view === "shared") {
        const res = await fetch(withBasePath("/api/shared-with-me"));
        const data = await res.json();
        setFolders(data.folders ?? []);
        setFiles(data.files ?? []);
        setBreadcrumb([]);
      } else if (view === "recent") {
        const res = await fetch(withBasePath("/api/recent"));
        const data = await res.json();
        setFolders([]);
        setFiles(data.files ?? []);
        setBreadcrumb([]);
      } else if (view === "starred") {
        const res = await fetch(withBasePath("/api/stars"));
        const data = await res.json();
        setFolders(data.folders ?? []);
        setFiles(data.files ?? []);
        setBreadcrumb([]);
      } else if (view === "trash") {
        const res = await fetch(withBasePath("/api/trash"));
        const data = await res.json();
        setFolders(data.folders ?? []);
        setFiles(data.files ?? []);
        setBreadcrumb([]);
      } else if (view === "media") {
        const res = await fetch(withBasePath("/api/media"));
        const data = await res.json();
        setFolders([]);
        setFiles(data.files ?? []);
        setBreadcrumb([]);
      } else {
        const qs = folderId ? `?parentId=${folderId}` : "";
        const res = await fetch(withBasePath(`/api/folders${qs}`));
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
    loadStars();
  }, [refreshMe, loadStars]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- veri klasör/görünüm değiştiğinde sunucudan yeniden çekilir
    load();
    setSidebarOpen(false);
    setSelected(new Set());
  }, [load]);

  function goFolder(id: string | null) {
    router.push(id ? `/drive?folder=${id}` : "/drive");
  }

  function goView(v: "shared" | "recent" | "starred" | "trash" | "media") {
    router.push(`/drive?view=${v}`);
  }

  function doSearch(query: string) {
    if (!query.trim()) router.push("/drive");
    else router.push(`/drive?q=${encodeURIComponent(query)}`);
  }

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (newMenuRef.current && !newMenuRef.current.contains(e.target as Node)) setNewMenuOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function createBlankDoc(kind: "docx" | "xlsx" | "pptx") {
    setNewMenuOpen(false);
    const res = await fetch(withBasePath("/api/files/create"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, folderId }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast(d.error ?? "Belge oluşturulamadı", "error");
      return;
    }
    const file = await res.json();
    toast(`"${file.name}" oluşturuldu`, "success");
    load();
    refreshMe();
    window.open(withBasePath(`/office/${file.id}`), "_blank");
  }

  async function createFolder(name: string) {
    setPending(null);
    const res = await fetch(withBasePath("/api/folders"), {
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
      const res = await fetch(withBasePath("/api/files"), { method: "POST", body: fd });
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

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (view !== "root" || draggedItem) return;
    uploadFiles(e.dataTransfer.files);
  }

  async function submitRenameFolder(folder: FolderItem, name: string) {
    setPending(null);
    if (name === folder.name) return;
    await fetch(withBasePath(`/api/folders/${folder.id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    load();
  }

  async function confirmDeleteFolder(folder: FolderItem) {
    setPending(null);
    const res = await fetch(withBasePath(`/api/folders/${folder.id}`), { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast(d.error ?? "Silinemedi", "error");
      return;
    }
    toast("Klasör çöp kutusuna taşındı");
    load();
    refreshMe();
  }

  async function submitRenameFile(file: FileItem, name: string) {
    setPending(null);
    if (name === file.name) return;
    await fetch(withBasePath(`/api/files/${file.id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    load();
  }

  async function confirmDeleteFile(file: FileItem) {
    setPending(null);
    const res = await fetch(withBasePath(`/api/files/${file.id}`), { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast(d.error ?? "Silinemedi", "error");
      return;
    }
    toast("Dosya çöp kutusuna taşındı");
    load();
    refreshMe();
  }

  function downloadFile(f: FileItem) {
    window.open(withBasePath(`/api/files/${f.id}`), "_blank");
  }

  function downloadFolderZip(f: FolderItem) {
    window.open(withBasePath(`/api/folders/${f.id}/download`), "_blank");
    toast("Zip indirmesi başladı", "success");
  }

  function openFile(f: FileItem) {
    if (previewKind(f.mimeType) === "none") {
      downloadFile(f);
    } else {
      setPreviewTarget({ id: f.id, name: f.name, mimeType: f.mimeType });
    }
  }

  function openOffice(f: FileItem) {
    window.open(withBasePath(`/office/${f.id}`), "_blank");
  }

  /** Word/Excel/PowerPoint dosyaları için menüye eklenecek "Office ile aç" öğesi (uygunsa), aksi halde boş dizi. */
  function officeMenuItem(f: FileItem): RowMenuItem[] {
    return officeDocType(f.name) ? [{ label: "Office ile aç", onClick: () => openOffice(f) }] : [];
  }

  async function convertToPdf(f: FileItem) {
    toast(`"${f.name}" PDF'e dönüştürülüyor…`);
    const res = await fetch(withBasePath(`/api/files/${f.id}/convert`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toExt: "pdf" }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast(d.error ?? "Dönüştürülemedi", "error");
      return;
    }
    const created = await res.json();
    toast(`"${created.name}" oluşturuldu`, "success");
    load();
    refreshMe();
  }

  /** docx/xlsx/pptx gibi dosyalar için "PDF'e dönüştür" menü öğesi (uygunsa), aksi halde boş dizi. */
  function convertMenuItem(f: FileItem): RowMenuItem[] {
    return officeDocType(f.name) && extOf(f.name) !== "pdf"
      ? [{ label: "PDF'e dönüştür", onClick: () => convertToPdf(f) }]
      : [];
  }

  async function submitMoveFolder(folder: FolderItem, destFolderId: string | null) {
    setPending(null);
    const res = await fetch(withBasePath(`/api/folders/${folder.id}`), {
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
    const res = await fetch(withBasePath(`/api/files/${file.id}`), {
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

  // --- Sürükle-bırak ile taşıma ---
  function handleDragStart(type: "file" | "folder", id: string) {
    return (e: React.DragEvent) => {
      if (view !== "root") return;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", `${type}:${id}`);
      setDraggedItem({ type, id });
    };
  }

  function handleDragEnd() {
    setDraggedItem(null);
    setDropTargetId(undefined);
  }

  function canDropOn(targetFolderId: string | null) {
    if (!draggedItem || view !== "root") return false;
    if (draggedItem.type === "folder" && draggedItem.id === targetFolderId) return false;
    return true;
  }

  function handleDropOn(targetFolderId: string | null) {
    return async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDropTargetId(undefined);
      const item = draggedItem;
      setDraggedItem(null);
      if (!item || !canDropOn(targetFolderId)) return;
      if (item.type === "folder") {
        const folder = folders.find((f) => f.id === item.id);
        if (!folder || folder.parentId === targetFolderId) return;
        await submitMoveFolder(folder, targetFolderId);
      } else {
        const file = files.find((f) => f.id === item.id);
        if (!file) return;
        if (file.folderId === targetFolderId) return;
        await submitMoveFile(file, targetFolderId);
      }
    };
  }

  // --- Yıldızlama ---
  async function toggleStar(type: "file" | "folder", id: string, currentlyStarred: boolean) {
    const method = currentlyStarred ? "DELETE" : "POST";
    await fetch(withBasePath("/api/stars"), {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetType: type, targetId: id }),
    });
    if (type === "file") {
      setStarredFileIds((s) => {
        const next = new Set(s);
        if (currentlyStarred) next.delete(id);
        else next.add(id);
        return next;
      });
    } else {
      setStarredFolderIds((s) => {
        const next = new Set(s);
        if (currentlyStarred) next.delete(id);
        else next.add(id);
        return next;
      });
    }
    if (view === "starred" && currentlyStarred) load();
  }

  // --- Çöp kutusu ---
  async function restoreFolder(folder: FolderItem) {
    await fetch(withBasePath(`/api/trash/restore/folder/${folder.id}`), { method: "POST" });
    toast(`"${folder.name}" geri getirildi`, "success");
    load();
    refreshMe();
  }

  async function restoreFile(file: FileItem) {
    await fetch(withBasePath(`/api/trash/restore/file/${file.id}`), { method: "POST" });
    toast(`"${file.name}" geri getirildi`, "success");
    load();
    refreshMe();
  }

  async function purgeFolder(folder: FolderItem) {
    setPending(null);
    await fetch(withBasePath(`/api/trash/purge/folder/${folder.id}`), { method: "DELETE" });
    toast("Kalıcı olarak silindi");
    load();
  }

  async function purgeFile(file: FileItem) {
    setPending(null);
    await fetch(withBasePath(`/api/trash/purge/file/${file.id}`), { method: "DELETE" });
    toast("Kalıcı olarak silindi");
    load();
  }

  // --- Toplu seçim ---
  function toggleSelect(type: "file" | "folder", id: string) {
    setSelected((s) => {
      const key = selKey(type, id);
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  const isSelected = (type: "file" | "folder", id: string) => selected.has(selKey(type, id));

  function selectedItems() {
    const selFolders = folders.filter((f) => selected.has(selKey("folder", f.id)));
    const selFiles = files.filter((f) => selected.has(selKey("file", f.id)));
    return { selFolders, selFiles };
  }

  async function bulkDelete() {
    setPending(null);
    const { selFolders, selFiles } = selectedItems();
    for (const f of selFolders) await fetch(withBasePath(`/api/folders/${f.id}`), { method: "DELETE" });
    for (const f of selFiles) await fetch(withBasePath(`/api/files/${f.id}`), { method: "DELETE" });
    toast(`${selFolders.length + selFiles.length} öğe çöp kutusuna taşındı`);
    setSelected(new Set());
    load();
    refreshMe();
  }

  async function bulkMove(destFolderId: string | null) {
    setPending(null);
    const { selFolders, selFiles } = selectedItems();
    for (const f of selFolders) {
      await fetch(withBasePath(`/api/folders/${f.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId: destFolderId }),
      });
    }
    for (const f of selFiles) {
      await fetch(withBasePath(`/api/files/${f.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId: destFolderId }),
      });
    }
    toast(`${selFolders.length + selFiles.length} öğe taşındı`, "success");
    setSelected(new Set());
    load();
  }

  function bulkDownload() {
    const { selFolders, selFiles } = selectedItems();
    for (const f of selFiles) downloadFile(f);
    for (const f of selFolders) downloadFolderZip(f);
  }

  if (!user) return null;

  const isTrash = view === "trash";
  const selectionCount = selected.size;

  return (
    <div
      className="flex min-h-screen flex-col"
      data-skin={user.uiSkin === "archive" ? "archive" : undefined}
      style={{ background: "var(--background)" }}
    >
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
            <SideLink active={view === "recent"} onClick={() => goView("recent")} label="Son kullanılanlar" icon="🕒" />
            <SideLink active={view === "starred"} onClick={() => goView("starred")} label="Yıldızlılar" icon="⭐" />
            <SideLink active={view === "media"} onClick={() => goView("media")} label="Medya" icon="🎬" />
            <SideLink active={view === "shared"} onClick={() => goView("shared")} label="Benimle paylaşılanlar" icon="🤝" />
            <SideLink active={view === "trash"} onClick={() => goView("trash")} label="Çöp kutusu" icon="🗑️" />
          </nav>
        </aside>

        <main
          className="relative flex-1 p-4 sm:p-6"
          onDragOver={(e) => {
            if (view !== "root" || draggedItem) return;
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          {dragOver && view === "root" && !draggedItem && (
            <div
              className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed text-sm font-medium"
              style={{ borderColor: "var(--accent)", background: "var(--accent-soft)", color: "var(--accent-soft-foreground)" }}
            >
              📤 Bırakınca yüklenir
            </div>
          )}

          {view === "root" && (
            <div className="mb-4 flex flex-wrap items-center gap-1 text-sm" style={{ color: "var(--text-secondary)" }}>
              <button
                onClick={() => goFolder(null)}
                className="rounded px-1 hover:underline"
                style={{
                  color: "inherit",
                  outline: dropTargetId === null && canDropOn(null) ? "2px dashed var(--accent)" : undefined,
                  background: dropTargetId === null && canDropOn(null) ? "var(--accent-soft)" : undefined,
                }}
                onDragOver={(e) => {
                  if (!canDropOn(null) || folderId === null) return;
                  e.preventDefault();
                  e.stopPropagation();
                  setDropTargetId(null);
                }}
                onDragLeave={(e) => {
                  e.stopPropagation();
                  setDropTargetId((cur) => (cur === null ? undefined : cur));
                }}
                onDrop={handleDropOn(null)}
              >
                Sürücüm
              </button>
              {breadcrumb.map((c) => (
                <span key={c.id} className="flex items-center gap-1">
                  <span>/</span>
                  <button
                    onClick={() => goFolder(c.id)}
                    className="rounded px-1 hover:underline"
                    style={{
                      outline: dropTargetId === c.id && canDropOn(c.id) ? "2px dashed var(--accent)" : undefined,
                      background: dropTargetId === c.id && canDropOn(c.id) ? "var(--accent-soft)" : undefined,
                    }}
                    onDragOver={(e) => {
                      if (!canDropOn(c.id) || c.id === folderId) return;
                      e.preventDefault();
                      e.stopPropagation();
                      setDropTargetId(c.id);
                    }}
                    onDragLeave={(e) => {
                      e.stopPropagation();
                      setDropTargetId((cur) => (cur === c.id ? undefined : cur));
                    }}
                    onDrop={handleDropOn(c.id)}
                  >
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
          {view === "recent" && (
            <h1 className="mb-4 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              Son kullanılanlar
            </h1>
          )}
          {view === "starred" && (
            <h1 className="mb-4 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              Yıldızlılar
            </h1>
          )}
          {view === "media" && (
            <h1 className="mb-4 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              Medya
            </h1>
          )}
          {view === "trash" && (
            <div className="mb-4">
              <h1 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                Çöp kutusu
              </h1>
              <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
                Silinen öğeler burada durur; geri getirebilir veya kalıcı olarak silebilirsiniz.
              </p>
            </div>
          )}

          <div className="mb-5 flex items-center justify-between gap-2">
            {view === "root" ? (
              <div className="flex gap-2">
                <div className="relative" ref={newMenuRef}>
                  <button className="btn-secondary" onClick={() => setNewMenuOpen((o) => !o)}>
                    + Yeni
                  </button>
                  {newMenuOpen && (
                    <div
                      className="absolute left-0 top-full z-30 mt-1 w-52 overflow-hidden rounded-lg border py-1 shadow-lg"
                      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
                    >
                      <button
                        className="block w-full px-3 py-2 text-left text-sm hover:opacity-80"
                        style={{ color: "var(--text-primary)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-hover)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        onClick={() => {
                          setNewMenuOpen(false);
                          setPending({ kind: "new-folder" });
                        }}
                      >
                        📁 Klasör
                      </button>
                      <button
                        className="block w-full px-3 py-2 text-left text-sm hover:opacity-80"
                        style={{ color: "var(--text-primary)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-hover)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        onClick={() => createBlankDoc("docx")}
                      >
                        📄 Word belgesi
                      </button>
                      <button
                        className="block w-full px-3 py-2 text-left text-sm hover:opacity-80"
                        style={{ color: "var(--text-primary)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-hover)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        onClick={() => createBlankDoc("xlsx")}
                      >
                        📊 Excel tablosu
                      </button>
                      <button
                        className="block w-full px-3 py-2 text-left text-sm hover:opacity-80"
                        style={{ color: "var(--text-primary)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-hover)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        onClick={() => createBlankDoc("pptx")}
                      >
                        📽️ PowerPoint sunumu
                      </button>
                    </div>
                  )}
                </div>
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
            ) : (
              <div />
            )}
            <ViewModeToggle mode={viewMode} onChange={setViewMode} />
          </div>

          {canBulk && selectionCount > 0 && (
            <div
              className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border px-4 py-2.5"
              style={{ borderColor: "var(--accent)", background: "var(--accent-soft)" }}
            >
              <span className="text-sm font-medium" style={{ color: "var(--accent-soft-foreground)" }}>
                {selectionCount} öğe seçildi
              </span>
              <div className="ml-auto flex flex-wrap gap-2">
                <button className="btn-secondary text-xs" onClick={bulkDownload}>
                  İndir
                </button>
                <button className="btn-secondary text-xs" onClick={() => setPending({ kind: "bulk-move" })}>
                  Taşı
                </button>
                <button
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-400"
                  onClick={() => setPending({ kind: "bulk-delete" })}
                >
                  Sil
                </button>
                <button className="btn-ghost text-xs" onClick={() => setSelected(new Set())}>
                  Vazgeç
                </button>
              </div>
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
              <span className="text-3xl">
                {view === "shared" ? "🤝" : view === "search" ? "🔍" : view === "recent" ? "🕒" : view === "starred" ? "⭐" : view === "trash" ? "🗑️" : view === "media" ? "🎬" : "📂"}
              </span>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {view === "shared"
                  ? "Henüz sizinle paylaşılan bir şey yok."
                  : view === "search"
                    ? "Sonuç bulunamadı."
                    : view === "recent"
                      ? "Henüz açtığınız/indirdiğiniz bir dosya yok."
                      : view === "starred"
                        ? "Henüz yıldızladığınız bir şey yok."
                        : view === "trash"
                          ? "Çöp kutusu boş."
                          : view === "media"
                            ? "Henüz erişebildiğiniz bir video/müzik dosyası yok."
                            : "Bu klasör boş."}
              </p>
            </div>
          )}

          {!loading && (folders.length > 0 || files.length > 0) && viewMode === "grid" && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {folders.map((f) => (
                <FolderCard
                  key={f.id}
                  folder={f}
                  selectable={canBulk}
                  selected={isSelected("folder", f.id)}
                  onToggleSelect={() => toggleSelect("folder", f.id)}
                  starred={starredFolderIds.has(f.id)}
                  onToggleStar={!isTrash ? () => toggleStar("folder", f.id, starredFolderIds.has(f.id)) : undefined}
                  onOpen={() =>
                    isTrash ? undefined : view === "shared" ? router.push(`/drive?folder=${f.id}`) : goFolder(f.id)
                  }
                  draggable={view === "root"}
                  onDragStart={handleDragStart("folder", f.id)}
                  onDragEnd={handleDragEnd}
                  isDropTarget={dropTargetId === f.id && canDropOn(f.id)}
                  onCardDragOver={(e) => {
                    if (!canDropOn(f.id)) return;
                    e.preventDefault();
                    e.stopPropagation();
                    setDropTargetId(f.id);
                  }}
                  onCardDragLeave={(e) => {
                    e.stopPropagation();
                    setDropTargetId((cur) => (cur === f.id ? undefined : cur));
                  }}
                  onCardDrop={handleDropOn(f.id)}
                  menuItems={
                    isTrash
                      ? [
                          { label: "Geri getir", onClick: () => restoreFolder(f) },
                          { label: "Kalıcı sil", onClick: () => setPending({ kind: "purge-folder", folder: f }), danger: true },
                        ]
                      : [
                          { label: "Paylaş", onClick: () => setShareTarget({ type: "folder", id: f.id, name: f.name }) },
                          { label: "İndir (.zip)", onClick: () => downloadFolderZip(f) },
                          ...(view === "root"
                            ? [
                                { label: "Taşı", onClick: () => setPending({ kind: "move-folder" as const, folder: f }) },
                                { label: "Yeniden adlandır", onClick: () => setPending({ kind: "rename-folder" as const, folder: f }) },
                                { label: "Sil", onClick: () => setPending({ kind: "delete-folder" as const, folder: f }), danger: true },
                              ]
                            : []),
                        ]
                  }
                />
              ))}
              {files.map((f) => (
                <FileCard
                  key={f.id}
                  file={f}
                  selectable={canBulk}
                  selected={isSelected("file", f.id)}
                  onToggleSelect={() => toggleSelect("file", f.id)}
                  starred={starredFileIds.has(f.id)}
                  onToggleStar={!isTrash ? () => toggleStar("file", f.id, starredFileIds.has(f.id)) : undefined}
                  onOpen={() => (isTrash ? undefined : openFile(f))}
                  draggable={view === "root"}
                  onDragStart={handleDragStart("file", f.id)}
                  onDragEnd={handleDragEnd}
                  menuItems={
                    isTrash
                      ? [
                          { label: "Geri getir", onClick: () => restoreFile(f) },
                          { label: "Kalıcı sil", onClick: () => setPending({ kind: "purge-file", file: f }), danger: true },
                        ]
                      : [
                          { label: "İndir", onClick: () => downloadFile(f) },
                          ...officeMenuItem(f),
                          ...convertMenuItem(f),
                          { label: "Paylaş", onClick: () => setShareTarget({ type: "file", id: f.id, name: f.name }) },
                          { label: "Versiyonlar", onClick: () => setVersionsTarget({ id: f.id, name: f.name }) },
                          ...(view === "root"
                            ? [
                                { label: "Taşı", onClick: () => setPending({ kind: "move-file" as const, file: f }) },
                                { label: "Yeniden adlandır", onClick: () => setPending({ kind: "rename-file" as const, file: f }) },
                                { label: "Sil", onClick: () => setPending({ kind: "delete-file" as const, file: f }), danger: true },
                              ]
                            : []),
                        ]
                  }
                />
              ))}
            </div>
          )}

          {!loading && (folders.length > 0 || files.length > 0) && viewMode === "list" && (
            <div className="card overflow-hidden">
              {folders.map((f) => (
                <div
                  key={f.id}
                  className="archive-tab group flex flex-wrap items-center gap-3 border-b px-4 py-3 transition-colors last:border-0"
                  style={{
                    borderColor: "var(--border)",
                    background: dropTargetId === f.id && canDropOn(f.id) ? "var(--accent-soft)" : undefined,
                    outline: dropTargetId === f.id && canDropOn(f.id) ? "2px dashed var(--accent)" : undefined,
                    outlineOffset: -2,
                  }}
                  onMouseEnter={(e) => {
                    if (dropTargetId !== f.id) e.currentTarget.style.background = "var(--surface-hover)";
                  }}
                  onMouseLeave={(e) => {
                    if (dropTargetId !== f.id) e.currentTarget.style.background = "transparent";
                  }}
                  draggable={view === "root"}
                  onDragStart={handleDragStart("folder", f.id)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => {
                    if (!canDropOn(f.id)) return;
                    e.preventDefault();
                    e.stopPropagation();
                    setDropTargetId(f.id);
                  }}
                  onDragLeave={(e) => {
                    e.stopPropagation();
                    setDropTargetId((cur) => (cur === f.id ? undefined : cur));
                  }}
                  onDrop={handleDropOn(f.id)}
                >
                  {canBulk && (
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0"
                      checked={isSelected("folder", f.id)}
                      onChange={() => toggleSelect("folder", f.id)}
                    />
                  )}
                  <button
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    disabled={isTrash}
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
                  {!isTrash && (
                    <StarButton starred={starredFolderIds.has(f.id)} onClick={() => toggleStar("folder", f.id, starredFolderIds.has(f.id))} />
                  )}
                  <span className="hidden text-xs sm:inline" style={{ color: "var(--text-tertiary)" }}>
                    {formatDate(f.updatedAt)}
                  </span>
                  <RowActions>
                    {isTrash ? (
                      <>
                        <button className="btn-ghost" onClick={() => restoreFolder(f)}>
                          Geri getir
                        </button>
                        <button
                          className="btn-ghost text-red-600 dark:text-red-400"
                          onClick={() => setPending({ kind: "purge-folder", folder: f })}
                        >
                          Kalıcı sil
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="btn-ghost" onClick={() => setShareTarget({ type: "folder", id: f.id, name: f.name })}>
                          Paylaş
                        </button>
                        <button className="btn-ghost" onClick={() => downloadFolderZip(f)}>
                          .zip
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
                      </>
                    )}
                  </RowActions>
                  <div className="sm:hidden">
                    <RowMenu
                      items={
                        isTrash
                          ? [
                              { label: "Geri getir", onClick: () => restoreFolder(f) },
                              { label: "Kalıcı sil", onClick: () => setPending({ kind: "purge-folder", folder: f }), danger: true },
                            ]
                          : [
                              { label: "Paylaş", onClick: () => setShareTarget({ type: "folder", id: f.id, name: f.name }) },
                              { label: "İndir (.zip)", onClick: () => downloadFolderZip(f) },
                              ...(view === "root"
                                ? [
                                    { label: "Taşı", onClick: () => setPending({ kind: "move-folder" as const, folder: f }) },
                                    { label: "Yeniden adlandır", onClick: () => setPending({ kind: "rename-folder" as const, folder: f }) },
                                    { label: "Sil", onClick: () => setPending({ kind: "delete-folder" as const, folder: f }), danger: true },
                                  ]
                                : []),
                            ]
                      }
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
                  draggable={view === "root"}
                  onDragStart={handleDragStart("file", f.id)}
                  onDragEnd={handleDragEnd}
                >
                  {canBulk && (
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0"
                      checked={isSelected("file", f.id)}
                      onChange={() => toggleSelect("file", f.id)}
                    />
                  )}
                  <button className="flex min-w-0 flex-1 items-center gap-3 text-left" disabled={isTrash} onClick={() => openFile(f)}>
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
                  {!isTrash && (
                    <StarButton starred={starredFileIds.has(f.id)} onClick={() => toggleStar("file", f.id, starredFileIds.has(f.id))} />
                  )}
                  <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                    {formatBytesStr(f.size)}
                  </span>
                  <span className="hidden text-xs sm:inline" style={{ color: "var(--text-tertiary)" }}>
                    {formatDate(f.updatedAt)}
                  </span>
                  <RowActions>
                    {isTrash ? (
                      <>
                        <button className="btn-ghost" onClick={() => restoreFile(f)}>
                          Geri getir
                        </button>
                        <button
                          className="btn-ghost text-red-600 dark:text-red-400"
                          onClick={() => setPending({ kind: "purge-file", file: f })}
                        >
                          Kalıcı sil
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="btn-ghost" onClick={() => downloadFile(f)}>
                          İndir
                        </button>
                        {officeDocType(f.name) && (
                          <button className="btn-ghost" onClick={() => openOffice(f)}>
                            Office ile aç
                          </button>
                        )}
                        {officeDocType(f.name) && extOf(f.name) !== "pdf" && (
                          <button className="btn-ghost" onClick={() => convertToPdf(f)}>
                            PDF&apos;e dönüştür
                          </button>
                        )}
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
                      </>
                    )}
                  </RowActions>
                  <div className="sm:hidden">
                    <RowMenu
                      items={
                        isTrash
                          ? [
                              { label: "Geri getir", onClick: () => restoreFile(f) },
                              { label: "Kalıcı sil", onClick: () => setPending({ kind: "purge-file", file: f }), danger: true },
                            ]
                          : [
                              { label: "İndir", onClick: () => downloadFile(f) },
                              ...officeMenuItem(f),
                              ...convertMenuItem(f),
                              { label: "Paylaş", onClick: () => setShareTarget({ type: "file", id: f.id, name: f.name }) },
                              { label: "Versiyonlar", onClick: () => setVersionsTarget({ id: f.id, name: f.name }) },
                              ...(view === "root"
                                ? [
                                    { label: "Taşı", onClick: () => setPending({ kind: "move-file" as const, file: f }) },
                                    { label: "Yeniden adlandır", onClick: () => setPending({ kind: "rename-file" as const, file: f }) },
                                    { label: "Sil", onClick: () => setPending({ kind: "delete-file" as const, file: f }), danger: true },
                                  ]
                                : []),
                            ]
                      }
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
          description={`"${pending.folder.name}" çöp kutusuna taşınacak, oradan geri getirebilirsiniz.`}
          confirmLabel="Çöp kutusuna taşı"
          onConfirm={() => confirmDeleteFolder(pending.folder)}
          onCancel={() => setPending(null)}
        />
      )}
      {pending?.kind === "delete-file" && (
        <ConfirmDialog
          title="Dosyayı sil"
          description={`"${pending.file.name}" çöp kutusuna taşınacak, oradan geri getirebilirsiniz.`}
          confirmLabel="Çöp kutusuna taşı"
          onConfirm={() => confirmDeleteFile(pending.file)}
          onCancel={() => setPending(null)}
        />
      )}
      {pending?.kind === "purge-folder" && (
        <ConfirmDialog
          title="Kalıcı olarak sil"
          description={`"${pending.folder.name}" ve içeriği kalıcı olarak silinecek. Bu işlem GERİ ALINAMAZ.`}
          confirmLabel="Kalıcı olarak sil"
          onConfirm={() => purgeFolder(pending.folder)}
          onCancel={() => setPending(null)}
        />
      )}
      {pending?.kind === "purge-file" && (
        <ConfirmDialog
          title="Kalıcı olarak sil"
          description={`"${pending.file.name}" kalıcı olarak silinecek. Bu işlem GERİ ALINAMAZ.`}
          confirmLabel="Kalıcı olarak sil"
          onConfirm={() => purgeFile(pending.file)}
          onCancel={() => setPending(null)}
        />
      )}
      {pending?.kind === "bulk-delete" && (
        <ConfirmDialog
          title="Seçilenleri sil"
          description={`${selectionCount} öğe çöp kutusuna taşınacak.`}
          confirmLabel="Çöp kutusuna taşı"
          onConfirm={bulkDelete}
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
      {pending?.kind === "bulk-move" && (
        <MoveDialog itemName={`${selectionCount} öğe`} onSelect={bulkMove} onClose={() => setPending(null)} />
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

function StarButton({ starred, onClick }: { starred: boolean; onClick: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="btn-ghost shrink-0 px-1.5"
      aria-label={starred ? "Yıldızı kaldır" : "Yıldızla"}
      title={starred ? "Yıldızı kaldır" : "Yıldızla"}
      style={starred ? { color: "#f59e0b" } : undefined}
    >
      {starred ? "★" : "☆"}
    </button>
  );
}

function ViewModeToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  return (
    <div className="flex shrink-0 rounded-lg border p-0.5" style={{ borderColor: "var(--border)" }}>
      {(["list", "grid"] as ViewMode[]).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          aria-label={m === "list" ? "Liste görünümü" : "Izgara görünümü"}
          className="rounded-md px-2.5 py-1.5 text-sm transition-colors"
          style={
            mode === m
              ? { background: "var(--accent-soft)", color: "var(--accent-soft-foreground)" }
              : { color: "var(--text-secondary)" }
          }
        >
          {m === "list" ? "☰" : "▦"}
        </button>
      ))}
    </div>
  );
}

function CardShell({
  onOpen,
  menuItems,
  selectable,
  selected,
  onToggleSelect,
  starred,
  onToggleStar,
  children,
  draggable,
  onDragStart,
  onDragEnd,
  isDropTarget,
  onCardDragOver,
  onCardDragLeave,
  onCardDrop,
  archiveTab,
}: {
  onOpen?: () => void;
  menuItems: RowMenuItem[];
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  starred?: boolean;
  onToggleStar?: () => void;
  children: React.ReactNode;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  isDropTarget?: boolean;
  onCardDragOver?: (e: React.DragEvent) => void;
  onCardDragLeave?: (e: React.DragEvent) => void;
  onCardDrop?: (e: React.DragEvent) => void;
  /** Sadece klasör kartları için: "Kurumsal Arşiv Dosya Dolabı" temasında (data-skin="archive") üstte asma dosya sekmesi gösterir. */
  archiveTab?: boolean;
}) {
  return (
    <div
      className={`group relative flex flex-col items-center rounded-xl border p-4 text-center transition-all ${archiveTab ? "archive-tab" : ""}`}
      style={{
        borderColor: isDropTarget ? "var(--accent)" : "var(--border)",
        background: isDropTarget ? "var(--accent-soft)" : "var(--surface)",
        outline: isDropTarget ? "2px dashed var(--accent)" : undefined,
        outlineOffset: -2,
      }}
      onMouseEnter={(e) => {
        if (isDropTarget) return;
        e.currentTarget.style.borderColor = "var(--accent)";
        e.currentTarget.style.boxShadow = "var(--shadow-md)";
      }}
      onMouseLeave={(e) => {
        if (isDropTarget) return;
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.boxShadow = "none";
      }}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onCardDragOver}
      onDragLeave={onCardDragLeave}
      onDrop={onCardDrop}
    >
      {selectable && (
        <input
          type="checkbox"
          className="absolute left-1.5 top-1.5 h-4 w-4"
          checked={!!selected}
          onChange={onToggleSelect}
          onClick={(e) => e.stopPropagation()}
        />
      )}
      {onToggleStar && (
        <div className={`absolute left-1.5 top-1.5 ${selectable ? "left-7" : ""} opacity-0 transition-opacity group-hover:opacity-100`}>
          <StarButton starred={!!starred} onClick={onToggleStar} />
        </div>
      )}
      <div className="absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover:opacity-100">
        <RowMenu items={menuItems} />
      </div>
      <button onClick={onOpen} className="flex w-full flex-col items-center gap-2" disabled={!onOpen}>
        {children}
      </button>
    </div>
  );
}

function FolderCard({
  folder,
  onOpen,
  menuItems,
  selectable,
  selected,
  onToggleSelect,
  starred,
  onToggleStar,
  draggable,
  onDragStart,
  onDragEnd,
  isDropTarget,
  onCardDragOver,
  onCardDragLeave,
  onCardDrop,
}: {
  folder: FolderItem;
  onOpen?: () => void;
  menuItems: RowMenuItem[];
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  starred?: boolean;
  onToggleStar?: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  isDropTarget?: boolean;
  onCardDragOver?: (e: React.DragEvent) => void;
  onCardDragLeave?: (e: React.DragEvent) => void;
  onCardDrop?: (e: React.DragEvent) => void;
}) {
  return (
    <CardShell
      onOpen={onOpen}
      menuItems={menuItems}
      selectable={selectable}
      selected={selected}
      onToggleSelect={onToggleSelect}
      starred={starred}
      onToggleStar={onToggleStar}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      isDropTarget={isDropTarget}
      onCardDragOver={onCardDragOver}
      onCardDragLeave={onCardDragLeave}
      onCardDrop={onCardDrop}
      archiveTab
    >
      <span
        className="flex h-14 w-14 items-center justify-center rounded-xl text-2xl"
        style={{ background: "var(--accent-soft)" }}
      >
        📁
      </span>
      <span className="line-clamp-2 w-full text-sm font-medium break-words" style={{ color: "var(--text-primary)" }}>
        {folder.name}
      </span>
    </CardShell>
  );
}

function FileCard({
  file,
  onOpen,
  menuItems,
  selectable,
  selected,
  onToggleSelect,
  starred,
  onToggleStar,
  draggable,
  onDragStart,
  onDragEnd,
}: {
  file: FileItem;
  onOpen?: () => void;
  menuItems: RowMenuItem[];
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  starred?: boolean;
  onToggleStar?: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
}) {
  return (
    <CardShell
      onOpen={onOpen}
      menuItems={menuItems}
      selectable={selectable}
      selected={selected}
      onToggleSelect={onToggleSelect}
      starred={starred}
      onToggleStar={onToggleStar}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <span
        className="flex h-14 w-14 items-center justify-center rounded-xl text-2xl"
        style={{ background: `${badgeColorForMime(file.mimeType)}1f` }}
      >
        {iconForMime(file.mimeType)}
      </span>
      <span className="line-clamp-2 w-full text-sm font-medium break-words" style={{ color: "var(--text-primary)" }}>
        {file.name}
      </span>
      <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
        {formatBytesStr(file.size)}
      </span>
    </CardShell>
  );
}

export default function DrivePage() {
  return (
    <Suspense>
      <DriveInner />
    </Suspense>
  );
}
