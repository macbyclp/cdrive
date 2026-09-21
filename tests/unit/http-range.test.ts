import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { parseRange } from "@/lib/http-range";

describe("parseRange", () => {
  it("başlık yoksa / desteklenmiyorsa null (tam içerik)", () => {
    expect(parseRange(null, 100)).toBeNull();
    expect(parseRange("items=0-5", 100)).toBeNull();
    expect(parseRange("bytes=0-5,10-20", 100)).toBeNull(); // çoklu aralık: tam içerik
    expect(parseRange("bytes=-", 100)).toBeNull();
  });
  it("bytes=a-b, bytes=a-, bytes=-n biçimlerini çözer", () => {
    expect(parseRange("bytes=0-9", 100)).toEqual({ start: 0, end: 9 });
    expect(parseRange("bytes=90-", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=50-500", 100)).toEqual({ start: 50, end: 99 }); // uç boyuta kırpılır
    expect(parseRange("bytes=-500", 100)).toEqual({ start: 0, end: 99 });
  });
  it("geçersiz aralıklar 'invalid' (416)", () => {
    expect(parseRange("bytes=100-", 100)).toBe("invalid");
    expect(parseRange("bytes=20-10", 100)).toBe("invalid");
    expect(parseRange("bytes=0-1", 0)).toBe("invalid");
    expect(parseRange("bytes=-0", 100)).toBe("invalid");
  });
});

describe("serveStoredFile (gerçek dosya, akış)", () => {
  let dir: string;
  let serve: typeof import("@/lib/http-range").serveStoredFile;
  const content = "0123456789ABCDEFGHIJ"; // 20 bayt

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "cdrive-range-"));
    await fs.writeFile(path.join(dir, "k1"), content);
    vi.resetModules();
    process.env.STORAGE_ROOT = dir;
    ({ serveStoredFile: serve } = await import("@/lib/http-range"));
  });
  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const req = (range?: string) => new Request("http://x/f", { headers: range ? { range } : {} });

  it("Range yoksa 200 + Accept-Ranges + tam içerik", async () => {
    const res = await serve(req(), { storageKey: "k1", contentType: "text/plain" });
    expect(res.status).toBe(200);
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(res.headers.get("content-length")).toBe("20");
    expect(await res.text()).toBe(content);
  });
  it("Range varsa 206 + Content-Range + yalnız istenen bayt aralığı", async () => {
    const res = await serve(req("bytes=5-9"), { storageKey: "k1", contentType: "text/plain" });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 5-9/20");
    expect(res.headers.get("content-length")).toBe("5");
    expect(await res.text()).toBe("56789");
  });
  it("son N bayt ve açık uçlu aralık", async () => {
    expect(await (await serve(req("bytes=-3"), { storageKey: "k1", contentType: "x" })).text()).toBe("HIJ");
    expect(await (await serve(req("bytes=18-"), { storageKey: "k1", contentType: "x" })).text()).toBe("IJ");
  });
  it("aralık dışıysa 416 + Content-Range: bytes */boyut", async () => {
    const res = await serve(req("bytes=50-60"), { storageKey: "k1", contentType: "x" });
    expect(res.status).toBe(416);
    expect(res.headers.get("content-range")).toBe("bytes */20");
  });
  it("diskte olmayan içerik 404 döner", async () => {
    const res = await serve(req(), { storageKey: "yok", contentType: "x" });
    expect(res.status).toBe(404);
  });
  it("ek başlıklar korunur", async () => {
    const res = await serve(req(), { storageKey: "k1", contentType: "text/plain", headers: { "Content-Disposition": "attachment" } });
    expect(res.headers.get("content-disposition")).toBe("attachment");
    await res.text();
  });
});
