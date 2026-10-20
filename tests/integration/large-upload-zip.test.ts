import { describe, it, expect, afterEach, afterAll, vi, beforeEach } from "vitest";
import { createHash, randomBytes } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { crc32 } from "zlib";
import yauzl from "yauzl";
import { prisma } from "@/lib/prisma";
import { createFileFromBuffer } from "@/lib/file-versions";
import { readFile, uploadsDir } from "@/lib/storage";
import { CHUNK_SIZE, UploadError, abortSession, completeSession, createSession, getSession, writeChunk } from "@/lib/upload-sessions";
import { decodeZipName, extractZipToFolder } from "@/lib/zip-extract";
import { PackError, collectSelection } from "@/lib/zip-pack";
import { createTestUser, createTestFolder, cleanupTestData } from "../helpers/db";

// Büyük dosya (parçalı) yükleme, akışlı ZIP çıkarma ve ZIP paketleme: güvenlik sınırları ve doğruluk.
const STORAGE_DIR = vi.hoisted(() => {
  const dir = "./.test-storage-large-zip";
  process.env.STORAGE_ROOT = dir;
  return dir;
});
afterAll(async () => {
  await fs.rm(STORAGE_DIR, { recursive: true, force: true });
});

let userIds: string[] = [];
beforeEach(() => {
  process.env.SESSION_SECRET = "test-secret-test-secret-test-secret-123";
});
afterEach(async () => {
  vi.doUnmock("@/lib/auth");
  vi.resetModules();
  await prisma.systemSettings.updateMany({ where: { id: 1 }, data: { blockedExtensions: null } });
  await cleanupTestData({ userIds });
  userIds = [];
  const dir = await uploadsDir();
  for (const f of await fs.readdir(dir)) await fs.rm(path.join(dir, f), { force: true });
});

async function user(role: "ADMIN" | "MEMBER" = "MEMBER") {
  const u = await createTestUser({ role });
  userIds.push(u.id);
  return prisma.user.findUniqueOrThrow({ where: { id: u.id } });
}

const body = (buf: Buffer) => new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(buf)); c.close(); } });
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

/** Parçaları verilen sırayla yükler. */
async function sendChunks(u: Awaited<ReturnType<typeof user>>, id: string, data: Buffer, order?: number[]) {
  const count = Math.ceil(data.length / CHUNK_SIZE);
  for (const i of order ?? Array.from({ length: count }, (_, k) => k)) {
    await writeChunk(u, id, i, body(data.subarray(i * CHUNK_SIZE, Math.min(data.length, (i + 1) * CHUNK_SIZE))));
  }
}

/** Yalnızca "stored" girdili minimal ZIP yazıcı (archiver yol adlarını temizlediği için saldırı adlarını elle üretiriz). */
function rawZip(entries: { name: string | Buffer; data: Buffer; utf8?: boolean }[]): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = typeof e.name === "string" ? Buffer.from(e.name, "utf-8") : e.name;
    const flags = e.utf8 === false ? 0 : 0x800;
    const crc = crc32(e.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(e.data.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, e.data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(flags, 8);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(e.data.length, 20);
    c.writeUInt32LE(e.data.length, 24);
    c.writeUInt16LE(name.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, name);
    offset += 30 + name.length + e.data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

async function writeZip(entries: Parameters<typeof rawZip>[0]) {
  const p = path.join(await uploadsDir(), `test-${randomBytes(6).toString("hex")}.zip`);
  await fs.writeFile(p, rawZip(entries));
  return p;
}

describe("parçalı yükleme", () => {
  it("parçalar sırasız gelse de dosya birebir kaydedilir; aynı adla tekrar yüklenince yeni sürüm olur", async () => {
    const u = await user();
    const data = randomBytes(CHUNK_SIZE * 2 + 123_456); // 3 parça, son parça kısa
    const s = await createSession(u, { name: "video-test.mp4", size: data.length, mimeType: "video/mp4" });
    expect(s.chunkCount).toBe(3);
    await sendChunks(u, s.id, data, [2, 0, 1]);
    const r = await completeSession(u, s.id);
    expect(r.kind).toBe("file");
    if (r.kind !== "file") return;
    const file = await prisma.file.findUniqueOrThrow({ where: { id: r.id }, include: { currentVersion: true } });
    expect(Number(file.size)).toBe(data.length);
    expect(file.mimeType).toBe("video/mp4");
    expect(sha(await readFile(file.currentVersion!.storageKey))).toBe(sha(data));
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).usedBytes).toBe(BigInt(data.length));

    // geçici dosyalar kalmadı
    expect((await fs.readdir(await uploadsDir())).filter((f) => f.includes(s.id))).toHaveLength(0);

    const again = randomBytes(CHUNK_SIZE + 10);
    const s2 = await createSession(u, { name: "video-test.mp4", size: again.length });
    await sendChunks(u, s2.id, again);
    const r2 = await completeSession(u, s2.id);
    expect(r2.kind === "file" && r2.versioned && r2.id === r.id).toBe(true);
    expect(await prisma.fileVersion.count({ where: { fileId: r.id } })).toBe(2);
  });

  it("aynı parça yeniden gönderilebilir (ağ yeniden denemesi); eksik parça varken tamamlanamaz", async () => {
    const u = await user();
    const data = randomBytes(CHUNK_SIZE + 5);
    const s = await createSession(u, { name: "a.bin", size: data.length });
    await writeChunk(u, s.id, 0, body(data.subarray(0, CHUNK_SIZE)));
    await writeChunk(u, s.id, 0, body(data.subarray(0, CHUNK_SIZE))); // tekrar
    expect((await getSession(u, s.id)).received).toEqual([0]);
    await expect(completeSession(u, s.id)).rejects.toMatchObject({ status: 409 });
    await writeChunk(u, s.id, 1, body(data.subarray(CHUNK_SIZE)));
    expect((await completeSession(u, s.id)).kind).toBe("file");
  });

  it("yanlış boyutlu parça reddedilir: eksik (400), fazla (413), geçersiz numara (400)", async () => {
    const u = await user();
    const s = await createSession(u, { name: "b.bin", size: CHUNK_SIZE + 100 });
    await expect(writeChunk(u, s.id, 0, body(randomBytes(1000)))).rejects.toMatchObject({ status: 400 }); // kısa
    await expect(writeChunk(u, s.id, 1, body(randomBytes(101)))).rejects.toMatchObject({ status: 413 }); // son parça 100 olmalı
    await expect(writeChunk(u, s.id, 7, body(randomBytes(1)))).rejects.toMatchObject({ status: 400 });
    await expect(writeChunk(u, s.id, -1, body(randomBytes(1)))).rejects.toMatchObject({ status: 400 });
    expect((await getSession(u, s.id)).received).toEqual([]);
  });

  it("başkasının yükleme oturumuna dokunulamaz (404): parça yazma, durum, tamamlama, iptal", async () => {
    const a = await user();
    const b = await user();
    const data = randomBytes(2048);
    const s = await createSession(a, { name: "gizli.bin", size: data.length });
    await expect(writeChunk(b, s.id, 0, body(data))).rejects.toMatchObject({ status: 404 });
    await expect(getSession(b, s.id)).rejects.toMatchObject({ status: 404 });
    await expect(completeSession(b, s.id)).rejects.toMatchObject({ status: 404 });
    await expect(abortSession(b, s.id)).rejects.toMatchObject({ status: 404 });
    // geçersiz kimlik biçimi yol geçişi denemesi olamaz
    await expect(getSession(a, "../../etc/passwd")).rejects.toBeInstanceOf(UploadError);
    await writeChunk(a, s.id, 0, body(data)); // sahibi hâlâ yazabilir
  });

  it("başlangıçta reddedilenler: başkasının klasörü (403), yasaklı uzantı, kota, geçersiz ad, .zip olmayan çıkarma", async () => {
    const owner = await user();
    const other = await user();
    const folder = await createTestFolder({ ownerId: owner.id, name: `ozel-${owner.id.slice(-6)}` });
    await expect(createSession(other, { name: "x.bin", size: 10, folderId: folder.id })).rejects.toMatchObject({ status: 403 });

    await prisma.systemSettings.upsert({ where: { id: 1 }, create: { id: 1, blockedExtensions: ".exe" }, update: { blockedExtensions: ".exe" } });
    await expect(createSession(other, { name: "kotu.exe", size: 10 })).rejects.toMatchObject({ status: 400 });

    await prisma.user.update({ where: { id: other.id }, data: { quotaBytes: 1000n, usedBytes: 0n } });
    const small = await prisma.user.findUniqueOrThrow({ where: { id: other.id } });
    await expect(createSession(small, { name: "buyuk.mp4", size: 5000 })).rejects.toBeTruthy(); // kota baştan reddeder

    const bs = String.fromCharCode(92);
    for (const bad of ["", "a/b.bin", `a${bs}b.bin`, "..", "x".repeat(300)]) {
      await expect(createSession(other, { name: bad, size: 10 })).rejects.toMatchObject({ status: 400 });
    }
    await expect(createSession(other, { name: "veri.bin", size: 10, extract: true })).rejects.toMatchObject({ status: 400 });
    await expect(createSession(other, { name: "bos.bin", size: 0 })).rejects.toMatchObject({ status: 400 });
  });

  it("iptal geçici dosyaları siler", async () => {
    const u = await user();
    const s = await createSession(u, { name: "iptal.bin", size: 100 });
    expect((await fs.readdir(await uploadsDir())).some((f) => f.startsWith(s.id))).toBe(true);
    await abortSession(u, s.id);
    expect((await fs.readdir(await uploadsDir())).some((f) => f.startsWith(s.id))).toBe(false);
  });

  it("tamamlama anında klasör izni tekrar denetlenir (yetki sonradan alınırsa dosya kaydedilmez)", async () => {
    const owner = await user();
    const other = await user();
    const folder = await createTestFolder({ ownerId: owner.id, name: `paylasim-${owner.id.slice(-6)}` });
    await prisma.folderPermission.create({ data: { folderId: folder.id, userId: other.id, permission: "EDIT" } });
    const data = randomBytes(5000);
    const s = await createSession(other, { name: "ok.bin", size: data.length, folderId: folder.id });
    await sendChunks(other, s.id, data);
    await prisma.folderPermission.deleteMany({ where: { userId: other.id, folderId: folder.id } });
    await expect(completeSession(other, s.id)).rejects.toMatchObject({ status: 403 });
    expect(await prisma.file.count({ where: { folderId: folder.id } })).toBe(0);
  });
});

describe("akışlı ZIP çıkarma", () => {
  it("klasör yapısını kurar, Türkçe (UTF-8) adları korur, arama metni çıkarır", async () => {
    const u = await user();
    const zip = await writeZip([
      { name: "Rapor/", data: Buffer.alloc(0) },
      { name: "Rapor/özet çğış.txt", data: Buffer.from("Çalışma özeti: donuk burger") },
      { name: "Rapor/alt/veri.csv", data: Buffer.from("a,b\n1,2\n") },
      { name: "kök.txt", data: Buffer.from("kök dosya") },
    ]);
    const r = await extractZipToFolder({ user: u, zipPath: zip, zipName: "t.zip", rootFolderId: null });
    expect(r).toMatchObject({ filesCreated: 3, skipped: 0 });
    expect(r.foldersCreated).toBe(2); // Rapor, Rapor/alt
    const f = await prisma.file.findFirstOrThrow({ where: { ownerId: u.id, name: "özet çğış.txt" } });
    expect(f.searchText).toContain("donuk burger");
    const alt = await prisma.folder.findFirstOrThrow({ where: { ownerId: u.id, name: "alt" } });
    expect((await prisma.folder.findUniqueOrThrow({ where: { id: alt.parentId! } })).name).toBe("Rapor");
    expect(await fs.readdir(await uploadsDir())).not.toContain(expect.stringMatching(/zipentry$/)); // geçici girdiler temiz
  });

  it("zip-slip ve mutlak yol adları kökün DIŞINA çıkamaz; gizli (.) dosyalar atlanır", async () => {
    const u = await user();
    const bs = String.fromCharCode(92);
    const zip = await writeZip([
      { name: "../evil.txt", data: Buffer.from("x") },
      { name: `..${bs}..${bs}winevil.txt`, data: Buffer.from("x") },
      { name: "/etc/passwd-benzeri.txt", data: Buffer.from("x") },
      { name: "a/../../b.txt", data: Buffer.from("x") },
      { name: ".gizli", data: Buffer.from("x") },
      { name: "normal.txt", data: Buffer.from("ok") },
    ]);
    const root = await createTestFolder({ ownerId: u.id, name: `kok-${u.id.slice(-6)}` });
    const r = await extractZipToFolder({ user: u, zipPath: zip, zipName: "slip.zip", rootFolderId: root.id });
    expect(r.skipped).toBe(1); // yalnızca .gizli
    const created = await prisma.file.findMany({ where: { ownerId: u.id } });
    // hiçbiri kök dışında (folderId null) ya da ".." adlı klasör altında değil
    for (const f of created) expect(f.folderId).not.toBeNull();
    expect(await prisma.folder.count({ where: { ownerId: u.id, name: { in: ["..", "."] } } })).toBe(0);
    expect(created.map((f) => f.name).sort()).toEqual(["b.txt", "evil.txt", "normal.txt", "passwd-benzeri.txt", "winevil.txt"]);
    // hepsi root altında (doğrudan veya alt klasörde)
    const ids = new Set([root.id, ...(await prisma.folder.findMany({ where: { ownerId: u.id } })).map((x) => x.id)]);
    for (const f of created) expect(ids.has(f.folderId!)).toBe(true);
  });

  it("aşırı sıkıştırılmış (zip bombası benzeri) girdi atlanır; diğerleri çıkarılır", async () => {
    const u = await user();
    // 3 MB sıfır → "stored" yazıcımızda oran 1:1 olur; oranı yapay olarak şişirmek için gerçek deflate kullan
    const { deflateRawSync } = await import("zlib");
    const zeros = Buffer.alloc(3 * 1024 * 1024);
    const packed = deflateRawSync(zeros);
    const nameB = Buffer.from("bomba.bin");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc32(zeros), 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(zeros.length, 22); local.writeUInt16LE(nameB.length, 26);
    const okEntry = rawZip([{ name: "iyi.txt", data: Buffer.from("tamam") }]);
    // iyi.txt'yi içeren zip'in yanına bomba girdisini elle ekleme yerine, tek zip'te iki girdi kuruyoruz:
    const c1 = Buffer.alloc(46);
    c1.writeUInt32LE(0x02014b50, 0); c1.writeUInt16LE(20, 4); c1.writeUInt16LE(20, 6); c1.writeUInt16LE(0x800, 8); c1.writeUInt16LE(8, 10);
    c1.writeUInt32LE(crc32(zeros), 16); c1.writeUInt32LE(packed.length, 20); c1.writeUInt32LE(zeros.length, 24); c1.writeUInt16LE(nameB.length, 28); c1.writeUInt32LE(0, 42);
    const okName = Buffer.from("iyi.txt");
    const okData = Buffer.from("tamam");
    const l2 = Buffer.alloc(30);
    l2.writeUInt32LE(0x04034b50, 0); l2.writeUInt16LE(20, 4); l2.writeUInt16LE(0x800, 6); l2.writeUInt32LE(crc32(okData), 14); l2.writeUInt32LE(okData.length, 18); l2.writeUInt32LE(okData.length, 22); l2.writeUInt16LE(okName.length, 26);
    const off2 = 30 + nameB.length + packed.length;
    const c2 = Buffer.alloc(46);
    c2.writeUInt32LE(0x02014b50, 0); c2.writeUInt16LE(20, 4); c2.writeUInt16LE(20, 6); c2.writeUInt16LE(0x800, 8);
    c2.writeUInt32LE(crc32(okData), 16); c2.writeUInt32LE(okData.length, 20); c2.writeUInt32LE(okData.length, 24); c2.writeUInt16LE(okName.length, 28); c2.writeUInt32LE(off2, 42);
    const cd = Buffer.concat([c1, nameB, c2, okName]);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(2, 8); end.writeUInt16LE(2, 10); end.writeUInt32LE(cd.length, 12);
    const body1 = Buffer.concat([local, nameB, packed, l2, okName, okData]);
    end.writeUInt32LE(body1.length, 16);
    const zip = path.join(await uploadsDir(), `bomba-${randomBytes(4).toString("hex")}.zip`);
    await fs.writeFile(zip, Buffer.concat([body1, cd, end]));
    void okEntry;

    const r = await extractZipToFolder({ user: u, zipPath: zip, zipName: "bomba.zip", rootFolderId: null });
    expect(r.filesCreated).toBe(1);
    expect(r.skipped).toBe(1);
    expect(r.errors[0]).toContain("bomba.bin");
    expect(await prisma.file.count({ where: { ownerId: u.id, name: "bomba.bin" } })).toBe(0);
  });

  it("kota dolunca ilgili girdi atlanır, hata kaydedilir ve geçici dosya kalmaz", async () => {
    const u = await user();
    await prisma.user.update({ where: { id: u.id }, data: { quotaBytes: 50n, usedBytes: 0n } });
    const small = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    const zip = await writeZip([{ name: "buyuk.txt", data: Buffer.alloc(500, 97) }, { name: "kucuk.txt", data: Buffer.from("k") }]);
    const r = await extractZipToFolder({ user: small, zipPath: zip, zipName: "k.zip", rootFolderId: null });
    expect(r.filesCreated).toBe(1);
    expect(r.errors.join(" ")).toContain("buyuk.txt");
    expect((await fs.readdir(await uploadsDir())).filter((f) => f.endsWith(".zipentry"))).toHaveLength(0);
  });

  it("aynı adlı dosya varsa yeni sürüm olur; bozuk zip anlaşılır hata verir", async () => {
    const u = await user();
    await createFileFromBuffer({ name: "ayni.txt", mimeType: "text/plain", folderId: null, ownerId: u.id, buffer: Buffer.from("eski") });
    const zip = await writeZip([{ name: "ayni.txt", data: Buffer.from("yeni") }]);
    await extractZipToFolder({ user: u, zipPath: zip, zipName: "v.zip", rootFolderId: null });
    const f = await prisma.file.findFirstOrThrow({ where: { ownerId: u.id, name: "ayni.txt" } });
    expect(await prisma.fileVersion.count({ where: { fileId: f.id } })).toBe(2);

    const bad = path.join(await uploadsDir(), "bozuk.zip");
    await fs.writeFile(bad, Buffer.from("bu bir zip degil"));
    await expect(extractZipToFolder({ user: u, zipPath: bad, zipName: "bozuk.zip", rootFolderId: null })).rejects.toMatchObject({ status: 400 });
  });

  it("UTF-8 bayrağı olmayan eski Windows (Türkçe 1254) adları çözülür", () => {
    // "çğış.txt" Windows-1254: ç=E7 ğ=F0 ı=FD ş=FE
    expect(decodeZipName(Buffer.from([0xe7, 0xf0, 0xfd, 0xfe, 0x2e, 0x74, 0x78, 0x74]))).toBe("çğış.txt");
    expect(decodeZipName(Buffer.from("özet.txt", "utf-8"))).toBe("özet.txt");
  });

  it("parçalı yükleme + extract: zip yüklenir, içeriği çıkarılır, zip dosyasının kendisi saklanmaz", async () => {
    const u = await user();
    const zip = rawZip([{ name: "klasor/dosya.txt", data: Buffer.from("içerik") }]);
    const s = await createSession(u, { name: "paket.zip", size: zip.length, extract: true });
    await writeChunk(u, s.id, 0, body(zip));
    const r = await completeSession(u, s.id);
    expect(r.kind).toBe("zip");
    if (r.kind !== "zip") return;
    const out = await extractZipToFolder({ user: u, zipPath: r.partPath, zipName: r.session.name, rootFolderId: null });
    expect(out.filesCreated).toBe(1);
    expect(await prisma.file.count({ where: { ownerId: u.id, name: "paket.zip" } })).toBe(0);
  });
});

describe("ZIP paketleme ve rotalar", () => {
  function mockAuth(u: { id: string }) {
    vi.resetModules();
    vi.doMock("@/lib/auth", () => ({
      requireUser: async () => prisma.user.findUniqueOrThrow({ where: { id: u.id } }),
      AuthError: class extends Error {},
    }));
  }
  const listZip = (buf: Buffer) =>
    new Promise<string[]>((resolve, reject) => {
      yauzl.fromBuffer(buf, { lazyEntries: true }, (err, z) => {
        if (err) return reject(err);
        const names: string[] = [];
        z.on("entry", (e) => { names.push(e.fileName); z.readEntry(); });
        z.on("end", () => resolve(names));
        z.readEntry();
      });
    });

  it("seçimde erişimi olmayan öğe tüm isteği reddeder (sessizce atlanmaz)", async () => {
    const a = await user();
    const b = await user();
    const mine = await createFileFromBuffer({ name: "benim.txt", mimeType: "text/plain", folderId: null, ownerId: a.id, buffer: Buffer.from("a") });
    const theirs = await createFileFromBuffer({ name: "onun.txt", mimeType: "text/plain", folderId: null, ownerId: b.id, buffer: Buffer.from("b") });
    await expect(collectSelection(a, { fileIds: [mine.id, theirs.id] })).rejects.toMatchObject({ status: 403 });
    await expect(collectSelection(a, { fileIds: [] })).rejects.toBeInstanceOf(PackError);
    const ok = await collectSelection(a, { fileIds: [mine.id] });
    expect(ok.entries.map((e) => e.path)).toEqual(["benim.txt"]);
  });

  it("zip-download: seçim (dosya + klasör ağacı) tek ZIP olarak iner, adlar çakışmaz", async () => {
    const u = await user();
    const f1 = await createFileFromBuffer({ name: "a.txt", mimeType: "text/plain", folderId: null, ownerId: u.id, buffer: Buffer.from("1") });
    const folder = await createTestFolder({ ownerId: u.id, name: "Klasör" });
    await createFileFromBuffer({ name: "a.txt", mimeType: "text/plain", folderId: folder.id, ownerId: u.id, buffer: Buffer.from("2") });
    mockAuth(u);
    const { POST } = await import("@/app/api/files/zip-download/route");
    const res = await POST(new Request("http://x/api/files/zip-download", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fileIds: [f1.id], folderIds: [folder.id] }) }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("content-disposition")).toContain(".zip");
    const names = await listZip(Buffer.from(await res.arrayBuffer()));
    expect(names.sort()).toEqual(["Klasör/a.txt", "a.txt"]);
  });

  it("zip-create → extract tam tur: sürücüde ZIP oluşur, çıkarınca içerik aynı, kota doğru işler", async () => {
    const u = await user();
    const data = randomBytes(300_000);
    const f1 = await createFileFromBuffer({ name: "foto.jpg", mimeType: "image/jpeg", folderId: null, ownerId: u.id, buffer: data });
    const folder = await createTestFolder({ ownerId: u.id, name: "Belgeler" });
    await createFileFromBuffer({ name: "not.txt", mimeType: "text/plain", folderId: folder.id, ownerId: u.id, buffer: Buffer.from("merhaba") });
    mockAuth(u);

    const create = await import("@/app/api/files/zip-create/route");
    const cr = await create.POST(new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fileIds: [f1.id], folderIds: [folder.id], name: "Arsiv" }) }));
    expect(cr.status).toBe(201);
    const made = await cr.json();
    expect(made.name).toBe("Arsiv.zip");
    const zipFile = await prisma.file.findUniqueOrThrow({ where: { id: made.id }, include: { currentVersion: true } });
    expect(zipFile.mimeType).toBe("application/zip");
    expect(await listZip(await readFile(zipFile.currentVersion!.storageKey))).toEqual(expect.arrayContaining(["foto.jpg", "Belgeler/not.txt"]));

    // aynı adla ikinci kez → " (2)"
    const cr2 = await create.POST(new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fileIds: [f1.id], name: "Arsiv" }) }));
    expect((await cr2.json()).name).toBe("Arsiv (2).zip");

    const extract = await import("@/app/api/files/[id]/extract/route");
    const er = await extract.POST(new Request("http://x", { method: "POST", body: JSON.stringify({}) }), { params: Promise.resolve({ id: made.id }) });
    expect(er.status).toBe(200);
    const out = await er.json();
    expect(out.folderName).toBe("Arsiv");
    const wrapper = out.folderId as string;
    const photo = await prisma.file.findFirstOrThrow({ where: { folderId: wrapper, name: "foto.jpg" }, include: { currentVersion: true } });
    expect(sha(await readFile(photo.currentVersion!.storageKey))).toBe(sha(data));
    const sub = await prisma.folder.findFirstOrThrow({ where: { parentId: wrapper, name: "Belgeler" } });
    expect(await prisma.file.count({ where: { folderId: sub.id, name: "not.txt" } })).toBe(1);

    // ikinci çıkarma → "Arsiv (2)" klasörü, mevcutlar ezilmez
    const er2 = await extract.POST(new Request("http://x", { method: "POST", body: "{}" }), { params: Promise.resolve({ id: made.id }) });
    expect((await er2.json()).folderName).toBe("Arsiv (2)");
  });

  it("extract: .zip olmayan dosya 400, erişimi olmayan kullanıcı 403", async () => {
    const owner = await user();
    const other = await user();
    const txt = await createFileFromBuffer({ name: "x.txt", mimeType: "text/plain", folderId: null, ownerId: owner.id, buffer: Buffer.from("x") });
    const zipBuf = rawZip([{ name: "i.txt", data: Buffer.from("i") }]);
    const z = await createFileFromBuffer({ name: "p.zip", mimeType: "application/zip", folderId: null, ownerId: owner.id, buffer: zipBuf });
    const extract = async (as: { id: string }, id: string) => {
      mockAuth(as);
      const route = await import("@/app/api/files/[id]/extract/route");
      return route.POST(new Request("http://x", { method: "POST", body: "{}" }), { params: Promise.resolve({ id }) });
    };
    expect((await extract(owner, txt.id)).status).toBe(400);
    expect((await extract(other, z.id)).status).toBe(403);
    expect((await extract(owner, z.id)).status).toBe(200);
  });
});
