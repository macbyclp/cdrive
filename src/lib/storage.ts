import { promises as fs, constants as fsConstants, createReadStream } from "fs";
import type { Readable } from "stream";
import path from "path";
import { randomUUID } from "crypto";

const STORAGE_ROOT = path.resolve(process.cwd(), process.env.STORAGE_ROOT ?? "./storage");

async function ensureRoot() {
  await fs.mkdir(STORAGE_ROOT, { recursive: true });
}

/** Yeni bir fiziksel dosya için benzersiz storage key üretir ve içeriği diske yazar. */
export async function writeFile(buffer: Buffer): Promise<string> {
  await ensureRoot();
  const key = randomUUID();
  const filePath = path.join(STORAGE_ROOT, key);
  await fs.writeFile(filePath, buffer);
  return key;
}

export async function readFile(storageKey: string): Promise<Buffer> {
  const filePath = path.join(STORAGE_ROOT, storageKey);
  return fs.readFile(filePath);
}

export async function deleteFile(storageKey: string): Promise<void> {
  const filePath = path.join(STORAGE_ROOT, storageKey);
  await fs.rm(filePath, { force: true });
}

export function storagePathFor(storageKey: string) {
  return path.join(STORAGE_ROOT, storageKey);
}

/** Diskteki dosyanın boyutu (bayt). Dosya yoksa ENOENT fırlatır. */
export async function statFile(storageKey: string): Promise<{ size: number }> {
  const st = await fs.stat(path.join(STORAGE_ROOT, storageKey));
  return { size: st.size };
}

/**
 * Dosyayı belleğe almadan akış olarak açar. `range` (kapsayıcı, bayt) verilirse yalnız o aralığı okur —
 * HTTP Range (206) yanıtları için. Büyük dosyalarda sabit bellek kullanımı sağlar.
 */
export function openReadStream(storageKey: string, range?: { start: number; end: number }): Readable {
  return createReadStream(path.join(STORAGE_ROOT, storageKey), range ? { start: range.start, end: range.end } : undefined);
}

/** Depolama kökü var ve bu süreç tarafından yazılabilir mi (sağlık kontrolü için; dosya yazmaz). */
export async function isStorageWritable(): Promise<boolean> {
  try {
    await ensureRoot();
    await fs.access(STORAGE_ROOT, fsConstants.W_OK);
    return true;
  } catch {
    return false;
  }
}
