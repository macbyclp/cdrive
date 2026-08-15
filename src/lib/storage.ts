import { promises as fs } from "fs";
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
