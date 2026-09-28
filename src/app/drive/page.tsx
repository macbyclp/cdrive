"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import AppShell from "@/components/AppShell";
import ShareDialog from "@/components/ShareDialog";
import VersionsDialog from "@/components/VersionsDialog";
import PreviewDialog from "@/components/PreviewDialog";
import OfficeEditorDialog from "@/components/OfficeEditorDialog";
import TagDialog from "@/components/TagDialog";
import ActivityDialog from "@/components/ActivityDialog";
import CommentsDialog from "@/components/CommentsDialog";
import ApprovalDialog from "@/components/ApprovalDialog";
import MoveDialog from "@/components/MoveDialog";
import ScanDialog from "@/components/ScanDialog";
import RowMenu, { type RowMenuItem } from "@/components/RowMenu";
import { InputDialog, ConfirmDialog, OfficeOpenModeDialog } from "@/components/Dialogs";
import { useToast } from "@/components/ToastProvider";
import { useMe } from "@/lib/useMe";
import type { Crumb, FileItem, FolderItem, Tag } from "@/lib/types";
import { badgeColorForMime, extOf, formatBytesStr, formatDate, iconForMime, officeDocType, previewKind } from "@/lib/format";
import { withBasePath } from "@/lib/basePath";

// Tarayıcının File and Directory Entries API'si (webkitGetAsEntry) resmi DOM tiplerinde tam
// karşılığı olmadığı için sürükle-bırak klasör yüklemesinde kullandığımız minimal alt küme.
type FileSystemDirectoryReaderLike = {
  readEntries: (cb: (entries: FileSystemEntryLike[]) => void, errCb: (err: unknown) => void) => void;
};
type FileSystemEntryLike = {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
  file?: (cb: (file: File) => void, errCb: (err: unknown) => void) => void;
  createReader?: () => FileSystemDirectoryReaderLike;
};

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
  const t = useTranslations("drive");
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
  // Onay bildiriminden gelen derin bağlantı: /drive?approval=<fileId>. Dosya bu
  // kullanıcının listesinde olmayabilir (onaylayıcının klasör izni yok) — o yüzden
  // listeden aramak yerine dosyayı doğrudan API'den çekip pencereyi açıyoruz.
  const approvalDeepLinkId = params.get("approval");

  const { user, refresh: refreshMe } = useMe();
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<Crumb[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareTarget, setShareTarget] = useState<{ type: "file" | "folder"; id: string; name: string } | null>(null);
  const [versionsTarget, setVersionsTarget] = useState<{ id: string; name: string } | null>(null);
  const [previewTarget, setPreviewTarget] = useState<{ id: string; name: string; mimeType: string } | null>(null);
  const [officeTarget, setOfficeTarget] = useState<{ id: string; name: string } | null>(null);
  const [officeChoiceTarget, setOfficeChoiceTarget] = useState<FileItem | null>(null);
  const [tagTarget, setTagTarget] = useState<{ type: "file" | "folder"; id: string; name: string; tags: Tag[] } | null>(
    null
  );
  const [activityTarget, setActivityTarget] = useState<{ type: "file" | "folder"; id: string; name: string } | null>(
    null
  );
  const [commentTarget, setCommentTarget] = useState<{ id: string; name: string } | null>(null);
  const [approvalTarget, setApprovalTarget] = useState<{ id: string; name: string; ownerId: string } | null>(null);
  const [searchFilters, setSearchFilters] = useState({
    type: "",
    dateFrom: "",
    dateTo: "",
    minSizeMb: "",
    maxSizeMb: "",
  });
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
  const zipInputRef = useRef<HTMLInputElement>(null);
  const [zipUploading, setZipUploading] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(VIEW_MODE_KEY) as ViewMode | null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount sonrası localStorage'dan tek seferlik senkronizasyon
    if (stored === "list" || stored === "grid") setViewModeState(stored);
  }, []);

  // "panel" arayüzü aktifse ve gerçekten /drive'ın kökündeyiz (dosya gezinme amacı olan
  // folder/view/q parametreleri yoksa) ana ekran olarak /panel'e yönlendir. Derin bağlantılar
  // (paylaşılan bir klasör linki, arama sonucu vb.) hep /drive'da kalmaya devam eder.
  // SADECE sayfaya İLK gelişte (fresh mount) kontrol edilir — yoksa kullanıcı /drive
  // içindeyken kendi "Sürücüm" (kök) linkine tıkladığında (goFolder(null) → router.push("/drive"),
  // parametresiz) bu useEffect params değişince tekrar tetiklenip onu anında geri /panel'e
  // atıyordu; kullanıcı /drive'ın kökünü hiç gezemiyordu (gerçek hata, canlıda bulundu).
  const didInitialPanelRedirectCheck = useRef(false);
  useEffect(() => {
    if (!user || didInitialPanelRedirectCheck.current) return;
    didInitialPanelRedirectCheck.current = true;
    if (user.uiSkin === "panel" && !folderId && !params.get("view") && !params.get("q")) {
      router.replace("/panel");
    }
  }, [user, folderId, params, router]);

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
        const params = new URLSearchParams({ q });
        if (searchFilters.type) params.set("type", searchFilters.type);
        if (searchFilters.dateFrom) params.set("dateFrom", searchFilters.dateFrom);
        if (searchFilters.dateTo) params.set("dateTo", searchFilters.dateTo);
        if (searchFilters.minSizeMb) params.set("minSizeMb", searchFilters.minSizeMb);
        if (searchFilters.maxSizeMb) params.set("maxSizeMb", searchFilters.maxSizeMb);
        const res = await fetch(withBasePath(`/api/search?${params.toString()}`));
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
          throw new Error(d.error ?? t("toast.loadFailed"));
        }
        const data = await res.json();
        setFolders(data.folders ?? []);
        setFiles(data.files ?? []);
        setBreadcrumb(data.breadcrumb ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("toast.genericError"));
    } finally {
      setLoading(false);
    }
  }, [folderId, view, q, searchFilters, t]);

  useEffect(() => {
    refreshMe();
    loadStars();
  }, [refreshMe, loadStars]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- veri klasör/görünüm değiştiğinde sunucudan yeniden çekilir
    load();
    setSelected(new Set());
  }, [load]);

  // Onay bildiriminden gelindiyse (?approval=<fileId>) dosyayı çekip pencereyi aç.
  useEffect(() => {
    if (!approvalDeepLinkId) return;
    let cancelled = false;
    fetch(withBasePath(`/api/files/${approvalDeepLinkId}?meta=1`))
      .then((r) => (r.ok ? r.json() : null))
      .then((f) => {
        if (cancelled || !f?.id) return;
        setApprovalTarget({ id: f.id, name: f.name, ownerId: f.ownerId });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [approvalDeepLinkId]);

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

  // --- Klavye kısayolları ---
  useEffect(() => {
    function isTypingTarget(el: EventTarget | null) {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return; // tarayıcı/OS kısayollarına karışma

      if (e.key === "Escape") {
        if (selected.size > 0) {
          e.preventDefault();
          setSelected(new Set());
        }
        return;
      }

      if (isTypingTarget(e.target)) return; // yazarken tetiklenmesin

      if (e.key === "/") {
        e.preventDefault();
        document.getElementById("cdrive-search-input")?.focus();
        return;
      }
      if (view !== "root") return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setPending({ kind: "new-folder" });
      } else if (e.key === "u" || e.key === "U") {
        e.preventDefault();
        fileInputRef.current?.click();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selected.size > 0) {
        e.preventDefault();
        setPending({ kind: "bulk-delete" });
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [view, selected]);

  async function createBlankDoc(kind: "docx" | "xlsx" | "pptx" | "txt") {
    setNewMenuOpen(false);
    const res = await fetch(withBasePath("/api/files/create"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, folderId }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast(d.error ?? t("toast.docCreateFailed"), "error");
      return;
    }
    const file = await res.json();
    toast(t("toast.createdNamed", { name: file.name }), "success");
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
      toast(d.error ?? t("toast.folderCreateFailed"), "error");
      return;
    }
    toast(t("toast.folderCreatedNamed", { name }), "success");
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
        toast(`${file.name}: ${d.error ?? t("toast.uploadFailed")}`, "error");
      } else {
        ok++;
      }
    }
    if (ok > 0) toast(ok === 1 ? t("toast.fileUploaded") : t("toast.filesUploadedCount", { count: ok }), "success");
    load();
    refreshMe();
  }

  async function uploadZip(fileList: FileList | null) {
    const zipFile = fileList?.[0];
    if (!zipFile) return;
    setZipUploading(true);
    const fd = new FormData();
    fd.append("file", zipFile);
    if (folderId) fd.append("folderId", folderId);
    const res = await fetch(withBasePath("/api/files/zip-upload"), { method: "POST", body: fd });
    setZipUploading(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast(d.error ?? t("toast.zipUploadFailed"), "error");
      return;
    }
    const d = await res.json();
    toast(
      t("toast.zipExtracted", { files: d.filesCreated, folders: d.foldersCreated }) +
        (d.skipped ? t("toast.zipSkippedSuffix", { skipped: d.skipped }) : ""),
      "success"
    );
    load();
    refreshMe();
  }

  /** DataTransferItem'ın klasör girişini (webkitGetAsEntry) okur — tarayıcı desteklemiyorsa null döner. */
  function asEntry(item: DataTransferItem): FileSystemEntryLike | null {
    const getEntry = (item as unknown as { webkitGetAsEntry?: () => FileSystemEntryLike | null }).webkitGetAsEntry;
    return getEntry ? getEntry.call(item) : null;
  }

  function readAllEntries(reader: FileSystemDirectoryReaderLike): Promise<FileSystemEntryLike[]> {
    return new Promise((resolve, reject) => {
      const all: FileSystemEntryLike[] = [];
      const readBatch = () => {
        reader.readEntries((entries) => {
          if (entries.length === 0) {
            resolve(all);
            return;
          }
          all.push(...entries);
          readBatch();
        }, reject);
      };
      readBatch();
    });
  }

  /** Bir dosya/klasör girişini (ve klasörse tüm alt ağacını) yükler — klasörler gerçek Folder kayıtları olarak oluşturulur. */
  async function uploadEntry(entry: FileSystemEntryLike, parentFolderId: string | null): Promise<boolean> {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => entry.file!(resolve, reject));
      const fd = new FormData();
      fd.append("file", file);
      if (parentFolderId) fd.append("folderId", parentFolderId);
      const res = await fetch(withBasePath("/api/files"), { method: "POST", body: fd });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast(`${entry.name}: ${d.error ?? t("toast.uploadFailed")}`, "error");
      }
      return res.ok;
    }
    if (entry.isDirectory) {
      const res = await fetch(withBasePath("/api/folders"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: entry.name, parentId: parentFolderId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast(t("toast.folderCreateFailedNamed", { name: entry.name, error: d.error ?? t("toast.genericErrorLower") }), "error");
        return false;
      }
      const newFolder = await res.json();
      const children = await readAllEntries(entry.createReader!());
      let allOk = true;
      for (const child of children) {
        const ok = await uploadEntry(child, newFolder.id);
        if (!ok) allOk = false;
      }
      return allOk;
    }
    return false;
  }

  /** Sürükle-bırak ile bırakılan öğeler arasında klasör varsa (webkitGetAsEntry ile) alt ağacıyla
   * birlikte gerçek Folder/File kayıtları olarak oluşturur; hiç klasör yoksa eski düz dosya
   * yükleme akışına düşer (bu tarayıcı API'sini desteklemeyen ortamlarda da güvenli bir geri dönüş). */
  async function uploadDroppedItems(dataTransfer: DataTransfer) {
    const items = Array.from(dataTransfer.items);
    const entries = items.map(asEntry).filter((e): e is FileSystemEntryLike => !!e);
    const hasFolder = entries.some((e) => e.isDirectory);
    if (entries.length === 0 || !hasFolder) {
      uploadFiles(dataTransfer.files);
      return;
    }
    let ok = 0;
    for (const entry of entries) {
      if (await uploadEntry(entry, folderId)) ok++;
    }
    if (ok > 0) toast(t("toast.itemsUploaded", { ok, total: entries.length }), "success");
    load();
    refreshMe();
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (view !== "root" || draggedItem) return;
    uploadDroppedItems(e.dataTransfer);
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
      toast(d.error ?? t("toast.deleteFailed"), "error");
      return;
    }
    toast(t("toast.folderTrashed"));
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
      toast(d.error ?? t("toast.deleteFailed"), "error");
      return;
    }
    toast(t("toast.fileTrashed"));
    load();
    refreshMe();
  }

  function downloadFile(f: FileItem) {
    window.open(withBasePath(`/api/files/${f.id}`), "_blank");
  }

  function downloadFolderZip(f: FolderItem) {
    window.open(withBasePath(`/api/folders/${f.id}/download`), "_blank");
    toast(t("toast.zipDownloadStarted"), "success");
  }

  function openFile(f: FileItem) {
    if (officeDocType(f.name)) {
      setOfficeChoiceTarget(f);
    } else if (previewKind(f.mimeType) === "none") {
      downloadFile(f);
    } else {
      setPreviewTarget({ id: f.id, name: f.name, mimeType: f.mimeType });
    }
  }

  function openOffice(f: FileItem) {
    setOfficeTarget({ id: f.id, name: f.name });
  }

  function openOfficeInTab(f: FileItem) {
    window.open(withBasePath(`/office/${f.id}`), "_blank");
  }

  /** Word/Excel/PowerPoint dosyaları için menüye eklenecek "Office ile aç" öğesi (uygunsa), aksi halde boş dizi. */
  function officeMenuItem(f: FileItem): RowMenuItem[] {
    return officeDocType(f.name) ? [{ label: t("menu.openWithOffice"), onClick: () => setOfficeChoiceTarget(f) }] : [];
  }

  async function convertToPdf(f: FileItem) {
    toast(t("toast.convertingToPdf", { name: f.name }));
    const res = await fetch(withBasePath(`/api/files/${f.id}/convert`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toExt: "pdf" }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast(d.error ?? t("toast.convertFailed"), "error");
      return;
    }
    const created = await res.json();
    toast(t("toast.createdNamed", { name: created.name }), "success");
    load();
    refreshMe();
  }

  async function copyFile(f: FileItem) {
    const res = await fetch(withBasePath(`/api/files/${f.id}/copy`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast(d.error ?? t("toast.copyFailed"), "error");
      return;
    }
    const created = await res.json();
    toast(t("toast.createdNamed", { name: created.name }), "success");
    load();
    refreshMe();
  }

  /** docx/xlsx/pptx gibi dosyalar için "PDF'e dönüştür" menü öğesi (uygunsa), aksi halde boş dizi. */
  function convertMenuItem(f: FileItem): RowMenuItem[] {
    return officeDocType(f.name) && extOf(f.name) !== "pdf"
      ? [{ label: t("menu.convertToPdf"), onClick: () => convertToPdf(f) }]
      : [];
  }

  function tagMenuItem(type: "file" | "folder", item: FileItem | FolderItem): RowMenuItem[] {
    return [
      {
        label: t("menu.tags"),
        onClick: () => setTagTarget({ type, id: item.id, name: item.name, tags: item.tags ?? [] }),
      },
    ];
  }

  function activityMenuItem(type: "file" | "folder", item: FileItem | FolderItem): RowMenuItem[] {
    return [
      {
        label: t("menu.activity"),
        onClick: () => setActivityTarget({ type, id: item.id, name: item.name }),
      },
    ];
  }

  function commentMenuItem(f: FileItem): RowMenuItem[] {
    return [
      {
        label: t("menu.comments"),
        onClick: () => setCommentTarget({ id: f.id, name: f.name }),
      },
      {
        label: t("menu.approval"),
        onClick: () => setApprovalTarget({ id: f.id, name: f.name, ownerId: f.ownerId }),
      },
    ];
  }

  /**
   * Bir klasör/dosya için "⋯" menüsünün TAM listesi — liste, ızgara ve mobil görünüm
   * aynı diziyi kullanır (önceden dört ayrı kopyaydı ve birbirinden sapmıştı).
   * Sıralama: sık kullanılanlar üstte, düzenleme ortada, yıkıcı eylem en altta.
   */
  function folderMenuItems(f: FolderItem): RowMenuItem[] {
    if (isTrash) {
      return [
        { label: t("menu.restore"), onClick: () => restoreFolder(f) },
        { label: t("menu.purge"), onClick: () => setPending({ kind: "purge-folder", folder: f }), danger: true },
      ];
    }
    return [
      { label: t("menu.downloadZip"), onClick: () => downloadFolderZip(f) },
      { label: t("menu.share"), onClick: () => setShareTarget({ type: "folder", id: f.id, name: f.name }) },
      ...tagMenuItem("folder", f),
      ...activityMenuItem("folder", f),
      ...(view === "root"
        ? [
            { label: t("menu.move"), onClick: () => setPending({ kind: "move-folder" as const, folder: f }) },
            { label: t("menu.rename"), onClick: () => setPending({ kind: "rename-folder" as const, folder: f }) },
            { label: t("menu.delete"), onClick: () => setPending({ kind: "delete-folder" as const, folder: f }), danger: true },
          ]
        : []),
    ];
  }

  function fileMenuItems(f: FileItem): RowMenuItem[] {
    if (isTrash) {
      return [
        { label: t("menu.restore"), onClick: () => restoreFile(f) },
        { label: t("menu.purge"), onClick: () => setPending({ kind: "purge-file", file: f }), danger: true },
      ];
    }
    return [
      { label: t("menu.download"), onClick: () => downloadFile(f) },
      { label: t("menu.share"), onClick: () => setShareTarget({ type: "file", id: f.id, name: f.name }) },
      ...officeMenuItem(f),
      ...convertMenuItem(f),
      { label: t("menu.copy"), onClick: () => copyFile(f) },
      { label: t("menu.versions"), onClick: () => setVersionsTarget({ id: f.id, name: f.name }) },
      ...tagMenuItem("file", f),
      ...activityMenuItem("file", f),
      ...commentMenuItem(f),
      ...(view === "root"
        ? [
            { label: t("menu.move"), onClick: () => setPending({ kind: "move-file" as const, file: f }) },
            { label: t("menu.rename"), onClick: () => setPending({ kind: "rename-file" as const, file: f }) },
            { label: t("menu.delete"), onClick: () => setPending({ kind: "delete-file" as const, file: f }), danger: true },
          ]
        : []),
    ];
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
      toast(d.error ?? t("toast.moveFailed"), "error");
      return;
    }
    toast(t("toast.moved"), "success");
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
      toast(d.error ?? t("toast.moveFailed"), "error");
      return;
    }
    toast(t("toast.moved"), "success");
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
    const res = await fetch(withBasePath(`/api/trash/restore/folder/${folder.id}`), { method: "POST" });
    if (!res.ok) {
      // Kota aşımı (413) dahil: kullanıcı neden geri gelmediğini görsün.
      const d = await res.json().catch(() => ({}));
      toast(d.error ?? t("toast.restoreFailed"), "error");
      return;
    }
    toast(t("toast.restoredNamed", { name: folder.name }), "success");
    load();
    refreshMe();
  }

  async function restoreFile(file: FileItem) {
    const res = await fetch(withBasePath(`/api/trash/restore/file/${file.id}`), { method: "POST" });
    if (!res.ok) {
      // Kota aşımı (413) dahil: kullanıcı neden geri gelmediğini görsün.
      const d = await res.json().catch(() => ({}));
      toast(d.error ?? t("toast.restoreFailed"), "error");
      return;
    }
    toast(t("toast.restoredNamed", { name: file.name }), "success");
    load();
    refreshMe();
  }

  async function purgeFolder(folder: FolderItem) {
    setPending(null);
    await fetch(withBasePath(`/api/trash/purge/folder/${folder.id}`), { method: "DELETE" });
    toast(t("toast.purged"));
    load();
  }

  async function purgeFile(file: FileItem) {
    setPending(null);
    await fetch(withBasePath(`/api/trash/purge/file/${file.id}`), { method: "DELETE" });
    toast(t("toast.purged"));
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
    toast(t("toast.itemsTrashed", { count: selFolders.length + selFiles.length }));
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
    toast(t("toast.itemsMoved", { count: selFolders.length + selFiles.length }), "success");
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
    <AppShell user={user} active="drive" onSearch={doSearch} dataSkin={user.uiSkin === "archive" ? "archive" : undefined}>
      <div className="mx-auto max-w-6xl">
        {/* Sürücü'ye özel görünüm anahtarı — genel sol menü artık ortak AppSidebar'da,
            bu sadece Sürücü içindeki (Sürücüm/Son kullanılanlar/Yıldızlılar/vb.) ikincil
            gezinme; OrdersScreen'deki yatay sekme deseniyle aynı dil kullanılıyor. */}
        <div className="mb-4 flex gap-1 overflow-x-auto border-b" style={{ borderColor: "var(--border)" }}>
          <ViewTab active={view === "root"} onClick={() => goFolder(null)} label={t("nav.root")} icon="🗂️" />
          <ViewTab active={view === "recent"} onClick={() => goView("recent")} label={t("nav.recent")} icon="🕒" />
          <ViewTab active={view === "starred"} onClick={() => goView("starred")} label={t("nav.starred")} icon="⭐" />
          <ViewTab active={view === "media"} onClick={() => goView("media")} label={t("nav.media")} icon="🎬" />
          <ViewTab active={view === "shared"} onClick={() => goView("shared")} label={t("nav.shared")} icon="🤝" />
          <ViewTab active={view === "trash"} onClick={() => goView("trash")} label={t("nav.trash")} icon="🗑️" />
        </div>

        <div
          className="relative"
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
              {t("dropOverlay")}
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
                {t("nav.root")}
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
            <div className="mb-4">
              <h1 className="mb-3 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                {q ? t("search.resultsFor", { q }) : t("search.filteredResults")}
              </h1>
              <div className="flex flex-wrap items-end gap-3 rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                    {t("search.typeLabel")}
                  </span>
                  <select
                    className="input"
                    value={searchFilters.type}
                    onChange={(e) => setSearchFilters((s) => ({ ...s, type: e.target.value }))}
                  >
                    <option value="">{t("search.typeAll")}</option>
                    <option value="image">{t("search.typeImage")}</option>
                    <option value="video">{t("search.typeVideo")}</option>
                    <option value="audio">{t("search.typeAudio")}</option>
                    <option value="pdf">{t("search.typePdf")}</option>
                    <option value="document">{t("search.typeDocument")}</option>
                    <option value="spreadsheet">{t("search.typeSpreadsheet")}</option>
                    <option value="presentation">{t("search.typePresentation")}</option>
                    <option value="archive">{t("search.typeArchive")}</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                    {t("search.dateFrom")}
                  </span>
                  <input
                    type="date"
                    className="input"
                    value={searchFilters.dateFrom}
                    onChange={(e) => setSearchFilters((s) => ({ ...s, dateFrom: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                    {t("search.dateTo")}
                  </span>
                  <input
                    type="date"
                    className="input"
                    value={searchFilters.dateTo}
                    onChange={(e) => setSearchFilters((s) => ({ ...s, dateTo: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                    {t("search.minSize")}
                  </span>
                  <input
                    type="number"
                    min={0}
                    className="input w-24"
                    value={searchFilters.minSizeMb}
                    onChange={(e) => setSearchFilters((s) => ({ ...s, minSizeMb: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                    {t("search.maxSize")}
                  </span>
                  <input
                    type="number"
                    min={0}
                    className="input w-24"
                    value={searchFilters.maxSizeMb}
                    onChange={(e) => setSearchFilters((s) => ({ ...s, maxSizeMb: e.target.value }))}
                  />
                </label>
                {(searchFilters.type ||
                  searchFilters.dateFrom ||
                  searchFilters.dateTo ||
                  searchFilters.minSizeMb ||
                  searchFilters.maxSizeMb) && (
                  <button
                    className="btn-ghost text-xs"
                    onClick={() => setSearchFilters({ type: "", dateFrom: "", dateTo: "", minSizeMb: "", maxSizeMb: "" })}
                  >
                    {t("search.clearFilters")}
                  </button>
                )}
              </div>
            </div>
          )}
          {view === "shared" && (
            <h1 className="mb-4 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              {t("nav.shared")}
            </h1>
          )}
          {view === "recent" && (
            <h1 className="mb-4 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              {t("nav.recent")}
            </h1>
          )}
          {view === "starred" && (
            <h1 className="mb-4 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              {t("nav.starred")}
            </h1>
          )}
          {view === "media" && (
            <h1 className="mb-4 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              {t("nav.media")}
            </h1>
          )}
          {view === "trash" && (
            <div className="mb-4">
              <h1 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                {t("trash.title")}
              </h1>
              <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
                {t("trash.hint")}
              </p>
            </div>
          )}

          <div className="mb-5 flex items-center justify-between gap-2">
            {view === "root" ? (
              <div className="flex gap-2">
                <div className="relative" ref={newMenuRef}>
                  <button className="btn-secondary" onClick={() => setNewMenuOpen((o) => !o)}>
                    {t("toolbar.new")}
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
                        {t("toolbar.newFolder")}
                      </button>
                      <button
                        className="block w-full px-3 py-2 text-left text-sm hover:opacity-80"
                        style={{ color: "var(--text-primary)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-hover)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        onClick={() => createBlankDoc("docx")}
                      >
                        {t("toolbar.newWord")}
                      </button>
                      <button
                        className="block w-full px-3 py-2 text-left text-sm hover:opacity-80"
                        style={{ color: "var(--text-primary)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-hover)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        onClick={() => createBlankDoc("xlsx")}
                      >
                        {t("toolbar.newExcel")}
                      </button>
                      <button
                        className="block w-full px-3 py-2 text-left text-sm hover:opacity-80"
                        style={{ color: "var(--text-primary)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-hover)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        onClick={() => createBlankDoc("pptx")}
                      >
                        {t("toolbar.newPowerpoint")}
                      </button>
                      <button
                        className="block w-full px-3 py-2 text-left text-sm hover:opacity-80"
                        style={{ color: "var(--text-primary)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-hover)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        onClick={() => createBlankDoc("txt")}
                      >
                        {t("toolbar.newText")}
                      </button>
                    </div>
                  )}
                </div>
                <button className="btn-primary" onClick={() => fileInputRef.current?.click()}>
                  {t("toolbar.upload")}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => uploadFiles(e.target.files)}
                />
                <button
                  className="btn-secondary"
                  disabled={zipUploading}
                  onClick={() => zipInputRef.current?.click()}
                  title={t("toolbar.zipUploadTitle")}
                >
                  {zipUploading ? t("toolbar.zipUploading") : t("toolbar.zipUpload")}
                </button>
                <input
                  ref={zipInputRef}
                  type="file"
                  accept=".zip,application/zip"
                  className="hidden"
                  onChange={(e) => uploadZip(e.target.files)}
                />
                <button className="btn-secondary" onClick={() => setScanOpen(true)} title={t("toolbar.scanTitle")}>
                  {t("toolbar.scan")}
                </button>
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
                {t("selection.count", { count: selectionCount })}
              </span>
              <div className="ml-auto flex flex-wrap gap-2">
                <button className="btn-secondary text-xs" onClick={bulkDownload}>
                  {t("selection.download")}
                </button>
                <button className="btn-secondary text-xs" onClick={() => setPending({ kind: "bulk-move" })}>
                  {t("selection.move")}
                </button>
                <button
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-400"
                  onClick={() => setPending({ kind: "bulk-delete" })}
                >
                  {t("selection.delete")}
                </button>
                <button className="btn-ghost text-xs" onClick={() => setSelected(new Set())}>
                  {t("selection.cancel")}
                </button>
              </div>
            </div>
          )}

          {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

          {loading && (
            <div className="card overflow-hidden">
              {/* Gerçek satırla aynı ölçüler (9x9 simge, ad, boyut, tarih) — yüklenince düzen zıplamasın. */}
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3 border-b px-4 py-3 last:border-0" style={{ borderColor: "var(--border)" }}>
                  <div className="skeleton h-9 w-9 shrink-0 rounded-lg" />
                  <div className="skeleton h-4 flex-1" style={{ maxWidth: `${14 - (i % 3) * 3}rem` }} />
                  <div className="skeleton ml-auto h-3 w-12" />
                  <div className="skeleton hidden h-3 w-28 sm:block" />
                </div>
              ))}
            </div>
          )}

          {!loading && folders.length === 0 && files.length === 0 && (
            <DriveEmptyState
              view={view}
              inSubfolder={!!folderId}
              onUpload={() => fileInputRef.current?.click()}
              onNewFolder={() => setPending({ kind: "new-folder" })}
              onGoRoot={() => goFolder(null)}
            />
          )}

          {!loading && (folders.length > 0 || files.length > 0) && viewMode === "grid" && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {folders.map((f) => (
                <FolderCard
                  key={f.id}
                  folder={f}
                  archive={user.uiSkin === "archive"}
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
                  menuItems={folderMenuItems(f)}
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
                  menuItems={fileMenuItems(f)}
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
                      style={{ background: user.uiSkin === "archive" ? "transparent" : "var(--accent-soft)" }}
                    >
                      <FolderGlyph archive={user.uiSkin === "archive"} />
                    </span>
                    <span className="truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      {f.name}
                    </span>
                    <TagDots tags={f.tags} />
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
                          {t("row.restore")}
                        </button>
                        <button
                          className="btn-ghost text-red-600 dark:text-red-400"
                          onClick={() => setPending({ kind: "purge-folder", folder: f })}
                        >
                          {t("row.purge")}
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="btn-ghost" onClick={() => downloadFolderZip(f)}>
                          {t("row.download")}
                        </button>
                        <button className="btn-ghost" onClick={() => setShareTarget({ type: "folder", id: f.id, name: f.name })}>
                          {t("row.share")}
                        </button>
                      </>
                    )}
                  </RowActions>
                  {!isTrash && <RowMenu items={folderMenuItems(f)} />}
                  {isTrash && (
                    <div className="sm:hidden">
                      <RowMenu items={folderMenuItems(f)} />
                    </div>
                  )}
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
                    <TagDots tags={f.tags} />
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
                          {t("row.restore")}
                        </button>
                        <button
                          className="btn-ghost text-red-600 dark:text-red-400"
                          onClick={() => setPending({ kind: "purge-file", file: f })}
                        >
                          {t("row.purge")}
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="btn-ghost" onClick={() => downloadFile(f)}>
                          {t("row.download")}
                        </button>
                        <button className="btn-ghost" onClick={() => setShareTarget({ type: "file", id: f.id, name: f.name })}>
                          {t("row.share")}
                        </button>
                      </>
                    )}
                  </RowActions>
                  {!isTrash && <RowMenu items={fileMenuItems(f)} />}
                  {isTrash && (
                    <div className="sm:hidden">
                      <RowMenu items={fileMenuItems(f)} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
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
      {officeChoiceTarget && (
        <OfficeOpenModeDialog
          fileName={officeChoiceTarget.name}
          onCancel={() => setOfficeChoiceTarget(null)}
          onChoose={(mode) => {
            const f = officeChoiceTarget;
            setOfficeChoiceTarget(null);
            if (mode === "popup") openOffice(f);
            else openOfficeInTab(f);
          }}
        />
      )}
      {officeTarget && (
        <OfficeEditorDialog
          fileId={officeTarget.id}
          fileName={officeTarget.name}
          onClose={() => setOfficeTarget(null)}
          onSaved={() => {
            load();
            refreshMe();
          }}
        />
      )}
      {tagTarget && (
        <TagDialog
          targetType={tagTarget.type}
          targetId={tagTarget.id}
          targetName={tagTarget.name}
          currentTags={tagTarget.tags}
          onClose={() => setTagTarget(null)}
          onChanged={load}
        />
      )}
      {activityTarget && (
        <ActivityDialog
          targetType={activityTarget.type}
          targetId={activityTarget.id}
          targetName={activityTarget.name}
          onClose={() => setActivityTarget(null)}
        />
      )}
      {commentTarget && user && (
        <CommentsDialog
          fileId={commentTarget.id}
          fileName={commentTarget.name}
          currentUserId={user.id}
          isAdmin={user.role === "ADMIN"}
          onClose={() => setCommentTarget(null)}
        />
      )}
      {approvalTarget && user && (
        <ApprovalDialog
          fileId={approvalTarget.id}
          fileName={approvalTarget.name}
          currentUserId={user.id}
          isAdmin={user.role === "ADMIN"}
          // Onaya gönderme EDIT ister; sunucu her hâlükârda kontrol ediyor (403).
          // Buradaki sadece arayüzü sadeleştirmek için kaba bir tahmin: sahip veya
          // admin. Paylaşımla EDIT almış biri formu görmez ama gerçek yetkisi durur —
          // yanlış tarafa hata yapıyoruz (fazla gösterip 403 yedirmek yerine gizlemek).
          canRequest={user.role === "ADMIN" || approvalTarget.ownerId === user.id}
          onClose={() => setApprovalTarget(null)}
        />
      )}

      {pending?.kind === "new-folder" && (
        <InputDialog
          title={t("dialog.newFolderTitle")}
          label={t("dialog.folderNameLabel")}
          confirmLabel={t("dialog.create")}
          onConfirm={createFolder}
          onCancel={() => setPending(null)}
        />
      )}
      {pending?.kind === "rename-folder" && (
        <InputDialog
          title={t("dialog.renameFolderTitle")}
          label={t("dialog.newNameLabel")}
          initialValue={pending.folder.name}
          onConfirm={(name) => submitRenameFolder(pending.folder, name)}
          onCancel={() => setPending(null)}
        />
      )}
      {pending?.kind === "rename-file" && (
        <InputDialog
          title={t("dialog.renameFileTitle")}
          label={t("dialog.newNameLabel")}
          initialValue={pending.file.name}
          onConfirm={(name) => submitRenameFile(pending.file, name)}
          onCancel={() => setPending(null)}
        />
      )}
      {pending?.kind === "delete-folder" && (
        <ConfirmDialog
          title={t("confirm.deleteFolderTitle")}
          description={t("confirm.moveToTrashDesc", { name: pending.folder.name })}
          confirmLabel={t("confirm.moveToTrash")}
          onConfirm={() => confirmDeleteFolder(pending.folder)}
          onCancel={() => setPending(null)}
        />
      )}
      {pending?.kind === "delete-file" && (
        <ConfirmDialog
          title={t("confirm.deleteFileTitle")}
          description={t("confirm.moveToTrashDesc", { name: pending.file.name })}
          confirmLabel={t("confirm.moveToTrash")}
          onConfirm={() => confirmDeleteFile(pending.file)}
          onCancel={() => setPending(null)}
        />
      )}
      {pending?.kind === "purge-folder" && (
        <ConfirmDialog
          title={t("confirm.purgeTitle")}
          description={t("confirm.purgeFolderDesc", { name: pending.folder.name })}
          confirmLabel={t("confirm.purgeTitle")}
          onConfirm={() => purgeFolder(pending.folder)}
          onCancel={() => setPending(null)}
        />
      )}
      {pending?.kind === "purge-file" && (
        <ConfirmDialog
          title={t("confirm.purgeTitle")}
          description={t("confirm.purgeFileDesc", { name: pending.file.name })}
          confirmLabel={t("confirm.purgeTitle")}
          onConfirm={() => purgeFile(pending.file)}
          onCancel={() => setPending(null)}
        />
      )}
      {pending?.kind === "bulk-delete" && (
        <ConfirmDialog
          title={t("confirm.bulkDeleteTitle")}
          description={t("confirm.bulkDeleteDesc", { count: selectionCount })}
          confirmLabel={t("confirm.moveToTrash")}
          onConfirm={bulkDelete}
          onCancel={() => setPending(null)}
        />
      )}
      {scanOpen && (
        <ScanDialog
          folderId={folderId}
          onClose={() => setScanOpen(false)}
          onError={(m) => toast(m, "error")}
          onSaved={(name, ocr, docxName) => {
            setScanOpen(false);
            toast(
              docxName ? t("toast.scanSavedDocx", { name, docx: docxName }) : t(ocr ? "toast.scanSavedOcr" : "toast.scanSaved", { name }),
              "success"
            );
            load();
            refreshMe();
          }}
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
        <MoveDialog itemName={t("selection.itemsLabel", { count: selectionCount })} onSelect={bulkMove} onClose={() => setPending(null)} />
      )}
    </AppShell>
  );
}

/**
 * Klasör simgesi — "Kurumsal Arşiv Dosya Dolabı" temasında (uiSkin==="archive")
 * düz 📁 emojisi yerine gerçek bir manila klasör siluetini (üstte belirgin
 * sekmeli) SVG olarak çizer; sadece renk değil, ŞEKLİN kendisi de değişir.
 */
function FolderGlyph({ archive, size = 20 }: { archive?: boolean; size?: number }) {
  if (!archive) return <>📁</>;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        d="M3 8h6.5l1.8 2H21v10.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8z"
        fill="var(--accent-soft)"
        stroke="var(--accent)"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M3 8V5.5a1 1 0 0 1 1-1h5.2l2 2.5H3.9" fill="var(--accent)" opacity="0.55" />
    </svg>
  );
}

/** Etiketleri, dosya/klasör adının yanında küçük renkli noktalar olarak gösterir (yer kaplamasın diye tam metin değil). */
function TagDots({ tags }: { tags?: Tag[] }) {
  if (!tags || tags.length === 0) return null;
  return (
    <span className="flex shrink-0 items-center gap-0.5" title={tags.map((t) => t.name).join(", ")}>
      {tags.slice(0, 5).map((t) => (
        <span key={t.id} className="h-1.5 w-1.5 rounded-full" style={{ background: t.color }} />
      ))}
    </span>
  );
}

/** Sürücü içi görünüm sekmesi — AppShell'in ortak yeni tasarımıyla tutarlı olsun diye
    (bkz. OrdersScreen'deki TABS) eski dikey off-canvas sidebar yerine yatay, alt-çizgili
    sekmeler kullanılıyor; mobilde de (overflow-x-auto ile) doğal olarak kaydırılabilir. */
function ViewTab({ active, onClick, label, icon }: { active: boolean; onClick: () => void; label: string; icon: string }) {
  return (
    <button
      onClick={onClick}
      className="flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium"
      style={{
        borderColor: active ? "var(--accent)" : "transparent",
        color: active ? "var(--text-primary)" : "var(--text-secondary)",
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
  const t = useTranslations("drive");
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="btn-ghost shrink-0 px-1.5"
      aria-label={starred ? t("star.remove") : t("star.add")}
      title={starred ? t("star.remove") : t("star.add")}
      style={starred ? { color: "#f59e0b" } : undefined}
    >
      {starred ? "★" : "☆"}
    </button>
  );
}

function ViewModeToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  const t = useTranslations("drive");
  return (
    <div className="flex shrink-0 rounded-lg border p-0.5" style={{ borderColor: "var(--border)" }}>
      {(["list", "grid"] as ViewMode[]).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          aria-label={m === "list" ? t("viewMode.list") : t("viewMode.grid")}
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
  archive,
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
  archive?: boolean;
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
        style={{ background: archive ? "transparent" : "var(--accent-soft)" }}
      >
        {archive ? <FolderGlyph archive size={40} /> : "📁"}
      </span>
      <span className="line-clamp-2 w-full text-sm font-medium break-words" style={{ color: "var(--text-primary)" }}>
        {folder.name}
      </span>
      <TagDots tags={folder.tags} />
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
      <TagDots tags={file.tags} />
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

const EMPTY_STATE_ICON: Record<View, string> = {
  root: "📂",
  shared: "🤝",
  search: "🔍",
  recent: "🕒",
  starred: "⭐",
  trash: "🗑️",
  media: "🎬",
};

/** Liste boşken ne olduğunu ve bir sonraki adımı anlatan durum kartı. */
function DriveEmptyState({
  view,
  inSubfolder,
  onUpload,
  onNewFolder,
  onGoRoot,
}: {
  view: View;
  inSubfolder: boolean;
  onUpload: () => void;
  onNewFolder: () => void;
  onGoRoot: () => void;
}) {
  const t = useTranslations("drive");
  const icon = EMPTY_STATE_ICON[view];
  const title = t(`emptyState.${view}.title`);
  const hint = t(`emptyState.${view}.hint`);
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-14 text-center"
      style={{ borderColor: "var(--border)" }}
    >
      <span
        className="flex h-14 w-14 items-center justify-center rounded-2xl text-3xl"
        style={{ background: "var(--accent-soft)" }}
        aria-hidden
      >
        {icon}
      </span>
      <div className="max-w-sm space-y-1">
        <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {view === "root" && inSubfolder ? t("emptyState.subfolderTitle") : title}
        </p>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {hint}
        </p>
      </div>
      {view === "root" && (
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          <button className="btn-primary" onClick={onUpload}>
            {t("emptyState.upload")}
          </button>
          <button className="btn-secondary" onClick={onNewFolder}>
            {t("emptyState.newFolder")}
          </button>
        </div>
      )}
      {(view === "shared" || view === "recent" || view === "starred") && (
        <button className="btn-secondary mt-1" onClick={onGoRoot}>
          {t("emptyState.goRoot")}
        </button>
      )}
    </div>
  );
}
