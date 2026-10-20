// Parçalı (chunked) büyük dosya yükleme: video/fotoğraf/arşiv gibi yüzlerce MB–GB'lık dosyalar için.
//
// Neden: tek istekle yüklemede tüm dosya bellekte tutuluyor (Buffer) ve vekil/proxy gövde sınırlarına takılıyordu.
// Burada istemci dosyayı 8 MB'lık parçalara böler; her parça doğrudan diskteki geçici dosyaya (rastgele ofsete)
// akıtılır — bellek kullanımı parça boyutuyla sınırlıdır, dosya boyutundan bağımsızdır. Tamamlanınca geçici dosya
// kopyalanmadan (rename) kalıcı depolamaya alınır ve normal yükleme kurallarıyla (yetki, politika, kota, sürümleme,
// denetim) kaydedilir. Oturum durumu depolama kökündeki `.uploads/` altında dosya olarak tutulur (DB değişikliği yok).

import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import mime from "mime-types";
import type { File as PrismaFile, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertQuota, canAccessFile, canAccessFolder } from "@/lib/access";
import { assertFilePolicy } from "@/lib/policy";
import { createFileFromKey, saveNewFileVersionFromKey } from "@/lib/file-versions";
import { extractSearchText } from "@/lib/text-extract";
import { notifyIfQuotaWarning } from "@/lib/quota-notify";
import { logAudit } from "@/lib/audit";
import { freeDiskBytes, moveIntoStorage, uploadsDir } from "@/lib/storage";
import { validFileName } from "@/lib/agent-upload";

export const CHUNK_SIZE = 8 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = (Number(process.env.MAX_UPLOAD_GB) > 0 ? Number(process.env.MAX_UPLOAD_GB) : 20) * 1024 * 1024 * 1024;
const MAX_ACTIVE_PER_USER = 6;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const SEARCH_TEXT_MAX_BYTES = 25 * 1024 * 1024; // bundan büyük dosyadan metin çıkarılmaz (video/arşiv/büyük PDF)
const DISK_HEADROOM = 512 * 1024 * 1024;

export class UploadError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type UploadSession = {
  id: string;
  userId: string;
  name: string;
  mimeType: string;
  size: number;
  chunkSize: number;
  chunkCount: number;
  folderId: string | null;
  /** true: dosya .zip ve tamamlanınca arşivin içeriği hedef klasöre çıkarılır (zip dosyasının kendisi saklanmaz). */
  extract: boolean;
  received: number[];
  createdAt: number;
};

const ID_RE = /^[0-9a-f-]{36}$/;

async function paths(id: string) {
  if (!ID_RE.test(id)) throw new UploadError("Geçersiz yükleme kimliği", 400);
  const dir = await uploadsDir();
  return { meta: path.join(dir, `${id}.json`), part: path.join(dir, `${id}.part`) };
}

// Aynı oturumun meta dosyası yazımları sıraya girer (tek Node süreci varsayımı — rate-limit ile aynı).
const locks = new Map<string, Promise<unknown>>();
function withLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(id) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(id, next.catch(() => {}));
  return next;
}

async function readSession(id: string): Promise<UploadSession | null> {
  const { meta } = await paths(id);
  try {
    return JSON.parse(await fs.readFile(meta, "utf-8")) as UploadSession;
  } catch {
    return null;
  }
}

async function loadOwned(id: string, userId: string): Promise<UploadSession> {
  const s = await readSession(id);
  // Başkasının oturumu "yok" gibi görünür (kimlik tahmini bilgi sızdırmasın).
  if (!s || s.userId !== userId) throw new UploadError("Yükleme oturumu bulunamadı veya süresi doldu", 404);
  return s;
}

async function removeSession(id: string) {
  const { meta, part } = await paths(id);
  await fs.rm(meta, { force: true });
  await fs.rm(part, { force: true });
  locks.delete(id);
}

/** 24 saatten eski yarım kalmış oturumları temizler (her yeni oturumda ucuzca çalışır). */
async function sweepStale() {
  const dir = await uploadsDir();
  let names: string[] = [];
  try {
    names = await fs.readdir(dir);
  } catch {
    return;
  }
  const now = Date.now();
  for (const n of names) {
    const full = path.join(dir, n);
    try {
      const st = await fs.stat(full);
      if (now - st.mtimeMs > SESSION_TTL_MS) await fs.rm(full, { force: true });
    } catch {
      /* başka istek silmiş olabilir */
    }
  }
}

async function activeCount(userId: string): Promise<number> {
  const dir = await uploadsDir();
  let n = 0;
  for (const f of await fs.readdir(dir).catch(() => [] as string[])) {
    if (!f.endsWith(".json")) continue;
    const s = await readSession(f.slice(0, -5));
    if (s?.userId === userId) n++;
  }
  return n;
}

export async function createSession(
  user: User,
  input: { name: string; size: number; mimeType?: string; folderId?: string | null; extract?: boolean }
): Promise<UploadSession> {
  const name = String(input.name ?? "").trim();
  if (!validFileName(name)) throw new UploadError("Geçersiz dosya adı");
  const size = Math.floor(Number(input.size));
  if (!Number.isFinite(size) || size <= 0) throw new UploadError("Dosya boş veya boyutu geçersiz");
  if (size > MAX_UPLOAD_BYTES) throw new UploadError(`Dosya çok büyük (en fazla ${Math.round(MAX_UPLOAD_BYTES / 1024 ** 3)} GB)`, 413);
  const extract = !!input.extract;
  if (extract && !name.toLowerCase().endsWith(".zip")) throw new UploadError("Yalnızca .zip dosyaları çıkarılabilir");
  const folderId = input.folderId || null;
  if (folderId && !(await canAccessFolder(user, folderId, "EDIT"))) throw new UploadError("Bu klasöre yükleme izniniz yok", 403);

  if (!extract) {
    await assertFilePolicy(name, BigInt(size)); // yasaklı uzantı / yönetici dosya boyutu sınırı — baştan reddet
    await assertQuota(user, BigInt(size)); //       kota — GB'larca veri yüklendikten sonra değil, baştan reddet
  }
  const free = await freeDiskBytes();
  if (free !== null && free < size + DISK_HEADROOM) throw new UploadError("Sunucuda yeterli disk alanı yok", 507);

  await sweepStale();
  if ((await activeCount(user.id)) >= MAX_ACTIVE_PER_USER) {
    throw new UploadError("Çok fazla yarım kalmış yükleme var; önce bitenleri bekleyin", 429);
  }

  const id = randomUUID();
  const { meta, part } = await paths(id);
  const session: UploadSession = {
    id,
    userId: user.id,
    name,
    mimeType: input.mimeType || (mime.lookup(name) as string | false) || "application/octet-stream",
    size,
    chunkSize: CHUNK_SIZE,
    chunkCount: Math.ceil(size / CHUNK_SIZE),
    folderId,
    extract,
    received: [],
    createdAt: Date.now(),
  };
  await (await fs.open(part, "w")).close();
  await fs.writeFile(meta, JSON.stringify(session));
  return session;
}

export async function getSession(user: User, id: string): Promise<UploadSession> {
  return loadOwned(id, user.id);
}

export async function abortSession(user: User, id: string): Promise<void> {
  await loadOwned(id, user.id);
  await removeSession(id);
}

function expectedChunkLength(s: UploadSession, index: number): number {
  return index < s.chunkCount - 1 ? s.chunkSize : s.size - (s.chunkCount - 1) * s.chunkSize;
}

/** Bir parçayı akıştan okuyup diskteki geçici dosyaya doğru ofsete yazar. Aynı parça tekrar gönderilebilir (yeniden deneme). */
export async function writeChunk(user: User, id: string, index: number, body: ReadableStream<Uint8Array> | null): Promise<UploadSession> {
  const s = await loadOwned(id, user.id);
  if (!Number.isInteger(index) || index < 0 || index >= s.chunkCount) throw new UploadError("Geçersiz parça numarası");
  if (!body) throw new UploadError("Parça gövdesi boş");
  const expected = expectedChunkLength(s, index);
  const { part } = await paths(id);

  const fh = await fs.open(part, "r+");
  let written = 0;
  try {
    const reader = body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      written += value.byteLength;
      if (written > expected) {
        await reader.cancel().catch(() => {});
        throw new UploadError("Parça beklenenden büyük", 413);
      }
      await fh.write(value, 0, value.byteLength, index * s.chunkSize + written - value.byteLength);
    }
  } finally {
    await fh.close();
  }
  if (written !== expected) throw new UploadError(`Parça eksik geldi (${written}/${expected} bayt); yeniden gönderin`, 400);

  return withLock(id, async () => {
    const fresh = (await readSession(id)) ?? s;
    if (!fresh.received.includes(index)) fresh.received = [...fresh.received, index].sort((a, b) => a - b);
    const { meta } = await paths(id);
    await fs.writeFile(meta, JSON.stringify(fresh));
    return fresh;
  });
}

export type CompleteResult =
  | { kind: "file"; id: string; name: string; size: number; versioned: boolean }
  | { kind: "zip"; partPath: string; session: UploadSession };

/**
 * Tüm parçalar geldiyse yüklemeyi bitirir. extract=false: dosya kaydedilir. extract=true: geçici zip yolunu döner
 * (çağıran içeriği çıkarır ve `removeSession` ile geçici dosyayı siler — bkz. finishExtract).
 */
export async function completeSession(user: User, id: string, agentLabel?: string): Promise<CompleteResult> {
  const s = await loadOwned(id, user.id);
  const missing = s.chunkCount - s.received.length;
  if (missing > 0) throw new UploadError(`${missing} parça eksik; yükleme tamamlanamadı`, 409);
  const { part } = await paths(id);
  const st = await fs.stat(part).catch(() => null);
  if (!st || st.size !== s.size) throw new UploadError("Yüklenen dosya boyutu beklenenle uyuşmuyor", 409);

  if (s.folderId && !(await canAccessFolder(user, s.folderId, "EDIT"))) throw new UploadError("Bu klasöre yükleme izniniz yok", 403);

  if (s.extract) return { kind: "zip", partPath: part, session: s };

  const size = BigInt(s.size);
  await assertFilePolicy(s.name, size);

  // Küçükçe dosyalarda arama metni çıkar (belge/PDF); büyük/ikili dosyalarda (video, arşiv) atla.
  let searchText: string | null = null;
  if (s.size <= SEARCH_TEXT_MAX_BYTES) searchText = await extractSearchText(await fs.readFile(part), s.mimeType).catch(() => null);

  // Kökte yalnızca kullanıcının KENDİ aynı adlı dosyası eşleşir (başkasının kök dosyasının üzerine yazılmaz).
  const existing: PrismaFile | null = await prisma.file.findFirst({
    where: { folderId: s.folderId, name: s.name, deletedAt: null, ...(s.folderId === null ? { ownerId: user.id } : {}) },
  });
  if (existing && !(await canAccessFile(user, existing.id, "EDIT"))) throw new UploadError("Aynı adlı dosyayı değiştirme izniniz yok", 403);

  const storageKey = await moveIntoStorage(part);
  let fileId: string;
  let versioned = false;
  try {
    if (existing) {
      const { file } = await saveNewFileVersionFromKey(existing, { storageKey, size, searchText }, user.id, { mimeType: s.mimeType });
      fileId = file.id;
      versioned = true;
    } else {
      const file = await createFileFromKey({ name: s.name, mimeType: s.mimeType, folderId: s.folderId, ownerId: user.id, storageKey, size, searchText });
      fileId = file.id;
      await logAudit({ userId: user.id, action: "UPLOAD", targetType: "file", targetId: fileId, detail: agentLabel ? `${s.name} (${agentLabel})` : s.name });
    }
  } finally {
    // createFileFromKey/saveNewFileVersionFromKey hatada depolamadaki dosyayı kendisi siler; meta dosyası burada kalkar.
    const { meta } = await paths(id);
    await fs.rm(meta, { force: true });
    locks.delete(id);
  }
  await notifyIfQuotaWarning(user.id);
  return { kind: "file", id: fileId, name: s.name, size: s.size, versioned };
}

/** Çıkarma bittikten (ya da başarısız olduktan) sonra oturumun geçici dosyalarını siler. */
export async function finishExtract(id: string): Promise<void> {
  await removeSession(id);
}
