import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";

// STORAGE_ROOT modül yüklenirken okunur; import'tan ÖNCE geçici dizine yönlendirilir.
const dir = mkdtempSync(path.join(tmpdir(), "cdrive-upload-"));
process.env.STORAGE_ROOT = dir;

type Mod = typeof import("@/lib/upload-stream");
let mod: Mod;
beforeAll(async () => {
  mod = await import("@/lib/upload-stream");
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const post = (form: FormData) => new Request("http://x/api/files", { method: "POST", body: form });
const filesOnDisk = () => readdirSync(dir).length;

describe("parseSingleFileUpload", () => {
  it("dosyayı diske akıtır; folderId dosyadan SONRA gelse de okunur; UTF-8 ad bozulmaz", async () => {
    const before = filesOnDisk();
    const form = new FormData();
    form.append("file", new File(["merhaba dünya"], "şğüİ rapor.txt", { type: "text/plain" }));
    form.append("folderId", "klasor-1");
    const up = await mod.parseSingleFileUpload(post(form), 1024 * 1024);
    expect(up.fields.folderId).toBe("klasor-1");
    expect(up.file).toMatchObject({ name: "şğüİ rapor.txt", mimeType: "text/plain", size: Buffer.byteLength("merhaba dünya") });
    expect(readFileSync(path.join(dir, up.file!.storageKey), "utf8")).toBe("merhaba dünya");
    expect(filesOnDisk()).toBe(before + 1);
  });

  it("büyük dosya (30 MB) bütün olarak ulaşır — 10 MB'ta kesilmez", async () => {
    const big = Buffer.alloc(30 * 1024 * 1024, 7);
    const form = new FormData();
    form.append("file", new File([big], "buyuk.bin", { type: "application/octet-stream" }));
    const up = await mod.parseSingleFileUpload(post(form), 100 * 1024 * 1024);
    expect(up.file!.size).toBe(big.length);
    expect(readFileSync(path.join(dir, up.file!.storageKey)).equals(big)).toBe(true);
  });

  it("sınırı aşan dosya UploadTooLargeError verir ve diskte parça bırakmaz", async () => {
    const before = filesOnDisk();
    const form = new FormData();
    form.append("file", new File([Buffer.alloc(5000)], "fazla.bin"));
    await expect(mod.parseSingleFileUpload(post(form), 1000)).rejects.toMatchObject({ status: 413, fileName: "fazla.bin" });
    expect(filesOnDisk()).toBe(before);
  });

  it("dosya parçası yoksa file=null döner", async () => {
    const form = new FormData();
    form.append("folderId", "x");
    const up = await mod.parseSingleFileUpload(post(form), 1000);
    expect(up.file).toBeNull();
    expect(up.fields.folderId).toBe("x");
  });

  it("'file' dışındaki ad ve ikinci dosya yok sayılır, diske yazılmaz", async () => {
    const before = filesOnDisk();
    const form = new FormData();
    form.append("baska", new File(["a"], "a.txt"));
    const up = await mod.parseSingleFileUpload(post(form), 1000);
    expect(up.file).toBeNull();
    expect(filesOnDisk()).toBe(before);
  });

  it("multipart olmayan istek 400 ile reddedilir", async () => {
    const req = new Request("http://x", { method: "POST", body: "düz", headers: { "content-type": "text/plain" } });
    await expect(mod.parseSingleFileUpload(req, 1000)).rejects.toMatchObject({ status: 400 });
  });
});
