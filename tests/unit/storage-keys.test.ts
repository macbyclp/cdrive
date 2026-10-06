import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { randomUUID } from "crypto";

const dir = mkdtempSync(path.join(tmpdir(), "cdrive-keys-"));
process.env.STORAGE_ROOT = dir;
let storage: typeof import("@/lib/storage");
beforeAll(async () => {
  storage = await import("@/lib/storage");
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("storageKey doğrulaması (kök dışına çıkış yok)", () => {
  it("yazılan UUID anahtar okunur ve silinir", async () => {
    const key = await storage.writeFile(Buffer.from("merhaba"));
    expect((await storage.readFile(key)).toString()).toBe("merhaba");
    expect(storage.storagePathFor(key).startsWith(dir)).toBe(true);
    await storage.deleteFile(key);
    await expect(storage.statFile(key)).rejects.toThrow();
  });

  it.each(["../etc/passwd", "a/b", "a\\b", "..", "", "/mutlak", "x\0y"])("geçersiz anahtar %j reddedilir", async (bad) => {
    await expect(storage.readFile(bad)).rejects.toThrow(/Geçersiz depolama anahtarı/);
    expect(() => storage.storagePathFor(bad)).toThrow(/Geçersiz/);
    expect(() => storage.openReadStream(bad)).toThrow(/Geçersiz/);
  });

  it("randomUUID biçimli anahtarlar geçerlidir", () => {
    expect(() => storage.storagePathFor(randomUUID())).not.toThrow();
  });
});
