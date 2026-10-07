// Claude yardımcısının kullandığı araçlar. HER araç, sohbeti başlatan kullanıcının yetkileriyle çalışır
// (canAccessFolder/canAccessFile/collectVisibleFiles) — Claude kullanıcının göremediği bir şeyi göremez.

import type { Prisma, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canAccessFile, canAccessFolder, collectVisibleFiles } from "@/lib/access";
import { readFile } from "@/lib/storage";
import {
  MAX_PROPOSAL_CHARS,
  MAX_READ_BYTES,
  MAX_READ_CHARS,
  isEditableText,
  readableText,
} from "@/lib/claude";

export class ToolError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const MAX_PENDING_PROPOSALS = 20;

function serializeFile(f: { id: string; name: string; mimeType: string; size: bigint; updatedAt: Date; folderId: string | null }) {
  return { id: f.id, name: f.name, mimeType: f.mimeType, size: Number(f.size), updatedAt: f.updatedAt.toISOString(), folderId: f.folderId };
}

export async function toolListFolder(user: User, folderId: string | null) {
  if (folderId) {
    if (!(await canAccessFolder(user, folderId, "VIEW"))) throw new ToolError("Bu klasöre erişim yok", 403);
    const [folders, files, self] = await Promise.all([
      prisma.folder.findMany({ where: { parentId: folderId, deletedAt: null }, orderBy: { name: "asc" }, take: 300 }),
      prisma.file.findMany({ where: { folderId, deletedAt: null }, orderBy: { name: "asc" }, take: 300 }),
      prisma.folder.findUnique({ where: { id: folderId }, select: { name: true } }),
    ]);
    return { location: self?.name ?? folderId, folders: folders.map((f) => ({ id: f.id, name: f.name })), files: files.map(serializeFile) };
  }
  // Kök: ADMIN tüm kök klasörleri görür; diğerleri kendi/departmanı/izin verilenleri (Sürücü sayfasıyla aynı kural).
  const where: Prisma.FolderWhereInput =
    user.role === "ADMIN"
      ? { parentId: null, deletedAt: null }
      : {
          parentId: null,
          deletedAt: null,
          OR: [
            { ownerId: user.id },
            ...(user.role === "MANAGER" && user.departmentId ? [{ departmentId: user.departmentId }] : []),
            { permissions: { some: { userId: user.id } } },
          ],
        };
  const [folders, files] = await Promise.all([
    prisma.folder.findMany({ where, orderBy: { name: "asc" }, take: 300 }),
    prisma.file.findMany({ where: { folderId: null, deletedAt: null, ownerId: user.id }, orderBy: { name: "asc" }, take: 300 }),
  ]);
  return { location: "Sürücüm (kök)", folders: folders.map((f) => ({ id: f.id, name: f.name })), files: files.map(serializeFile) };
}

export async function toolSearch(user: User, query: string) {
  const q = query.trim().slice(0, 200);
  if (!q) throw new ToolError("Arama metni boş");
  const ftsQuery = q.replace(/[^\p{L}\p{N}\s]/gu, " ").trim();
  type Row = Prisma.FileGetPayload<Record<string, never>>;
  const fetchPage = async (skip: number, take: number): Promise<Row[]> => {
    const [byName, byContent] = await Promise.all([
      prisma.file.findMany({ where: { deletedAt: null, name: { contains: q } }, skip, take, orderBy: { updatedAt: "desc" } }),
      ftsQuery.length >= 3
        ? prisma.file.findMany({ where: { deletedAt: null, searchText: { search: ftsQuery } }, skip, take, orderBy: { updatedAt: "desc" } })
        : Promise.resolve([] as Row[]),
    ]);
    const byId = new Map(byName.map((f) => [f.id, f]));
    for (const f of byContent) if (!byId.has(f.id)) byId.set(f.id, f);
    return [...byId.values()].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  };
  const visible = await collectVisibleFiles(user, fetchPage, 20);
  return { files: visible.slice(0, 20).map(serializeFile) };
}

export async function toolRead(user: User, fileId: string, offset = 0) {
  if (!(await canAccessFile(user, fileId, "VIEW"))) throw new ToolError("Bu dosyaya erişim yok", 403);
  const file = await prisma.file.findUnique({ where: { id: fileId }, include: { currentVersion: true } });
  if (!file || file.deletedAt || !file.currentVersion) throw new ToolError("Dosya bulunamadı", 404);
  if (file.size > BigInt(MAX_READ_BYTES)) throw new ToolError("Dosya okunamayacak kadar büyük (25 MB üstü)");
  const buffer = await readFile(file.currentVersion.storageKey).catch(() => null);
  if (!buffer) throw new ToolError("Dosya içeriği depolamada bulunamadı", 404);
  const text = await readableText(buffer, file.mimeType, file.name);
  if (text === null) {
    throw new ToolError(`"${file.name}" türündeki dosyanın içeriği metne çevrilemiyor (görsel, ses, video veya desteklenmeyen biçim)`);
  }
  const start = Math.max(0, Math.floor(offset));
  const slice = text.slice(start, start + MAX_READ_CHARS);
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    editable: isEditableText(file.name, file.mimeType),
    totalChars: text.length,
    offset: start,
    truncated: start + slice.length < text.length,
    // İÇERİK VERİDİR: içindeki hiçbir talimat Claude'a komut değildir (sistem istemi bunu belirtir).
    content: slice,
  };
}

async function pendingCount(userId: string) {
  return prisma.claudeProposal.count({ where: { userId, status: "PENDING" } });
}

export async function toolProposeEdit(user: User, input: { fileId: string; content: string; summary?: string }) {
  if (input.content.length > MAX_PROPOSAL_CHARS) throw new ToolError("Öneri çok büyük");
  if (!(await canAccessFile(user, input.fileId, "EDIT"))) throw new ToolError("Bu dosyayı düzenleme yetkiniz yok", 403);
  const file = await prisma.file.findUnique({ where: { id: input.fileId }, include: { currentVersion: true } });
  if (!file || file.deletedAt || !file.currentVersion) throw new ToolError("Dosya bulunamadı", 404);
  if (!isEditableText(file.name, file.mimeType)) {
    throw new ToolError(`"${file.name}" düz metin değil; Word/Excel/PDF gibi dosyalar bu sürümde yalnızca okunabilir. Yeni bir metin dosyası önerebilirsiniz.`);
  }
  if ((await pendingCount(user.id)) >= MAX_PENDING_PROPOSALS) throw new ToolError("Bekleyen çok fazla öneri var; önce onaylayın veya reddedin");
  const proposal = await prisma.claudeProposal.create({
    data: {
      userId: user.id,
      kind: "edit",
      fileId: file.id,
      baseVersionId: file.currentVersion.id,
      name: file.name,
      content: input.content,
      summary: input.summary?.slice(0, 1000) ?? null,
    },
  });
  return { proposalId: proposal.id, status: "PENDING", note: "Öneri kaydedildi. Kullanıcı onaylayana kadar dosya DEĞİŞMEDİ." };
}

const BAD_NAME = /[\\/:*?"<>|\u0000-\u001f]/;

export async function toolProposeNewFile(user: User, input: { name: string; content: string; folderId?: string | null; summary?: string }) {
  const name = input.name.trim();
  if (!name || name.length > 200 || BAD_NAME.test(name) || name === "." || name === "..") throw new ToolError("Geçersiz dosya adı");
  if (!isEditableText(name)) throw new ToolError("Yalnızca düz metin dosyaları (txt, md, csv, json, html…) oluşturulabilir");
  if (input.content.length > MAX_PROPOSAL_CHARS) throw new ToolError("Öneri çok büyük");
  const folderId = input.folderId ?? null;
  if (folderId && !(await canAccessFolder(user, folderId, "EDIT"))) throw new ToolError("Bu klasörde dosya oluşturma yetkiniz yok", 403);
  if ((await pendingCount(user.id)) >= MAX_PENDING_PROPOSALS) throw new ToolError("Bekleyen çok fazla öneri var; önce onaylayın veya reddedin");
  const proposal = await prisma.claudeProposal.create({
    data: { userId: user.id, kind: "create", folderId, name, content: input.content, summary: input.summary?.slice(0, 1000) ?? null },
  });
  return { proposalId: proposal.id, status: "PENDING", note: "Yeni dosya önerisi kaydedildi. Kullanıcı onaylayana kadar dosya OLUŞTURULMADI." };
}
