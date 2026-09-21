import { describe, it, expect, afterEach, vi } from "vitest";
import { promises as fs } from "fs";
import { prisma } from "@/lib/prisma";
import { createFileFromBuffer, saveNewFileVersion } from "@/lib/file-versions";
import { softDeleteFolderRecursive, restoreFolderRecursive, purgeFile } from "@/lib/trash";
import { storagePathFor } from "@/lib/storage";
import { visibleFileIds, filePermissionLevel, assertQuota } from "@/lib/access";
import { runCleanup } from "@/lib/cleanup";
import { createTestUser, createTestFolder, createTestFile, cleanupTestData } from "../helpers/db";

let userIds: string[] = [];
let departmentIds: string[] = [];

afterEach(async () => {
  await cleanupTestData({ userIds, departmentIds });
  userIds = [];
  departmentIds = [];
});

const buf = (n: number) => Buffer.alloc(n, "a");
const used = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id } })).usedBytes;
const exists = (key: string) => fs.access(storagePathFor(key)).then(() => true, () => false);

async function user(quota?: bigint, departmentId?: string) {
  const u = await createTestUser({ departmentId });
  userIds.push(u.id);
  if (quota !== undefined) await prisma.user.update({ where: { id: u.id }, data: { quotaBytes: quota } });
  return prisma.user.findUniqueOrThrow({ where: { id: u.id } });
}

describe("createFileFromBuffer (transaction + disk temizliği)", () => {
  it("dosya, v1 sürümü, currentVersionId ve kotayı atomik oluşturur", async () => {
    const u = await user();
    const f = await createFileFromBuffer({ name: "a.txt", mimeType: "text/plain", folderId: null, ownerId: u.id, buffer: buf(100) });
    const version = await prisma.fileVersion.findFirstOrThrow({ where: { fileId: f.id } });
    expect(f.currentVersionId).toBe(version.id);
    expect(await used(u.id)).toBe(100n);
    expect(await exists(version.storageKey)).toBe(true);
  });

  it("kota aşılırsa 413 fırlatır, DB'de kayıt ve diskte yetim dosya BIRAKMAZ", async () => {
    const u = await user(50n);
    const before = (await fs.readdir(storagePathFor(""))).length;
    await expect(
      createFileFromBuffer({ name: "b.txt", mimeType: "text/plain", folderId: null, ownerId: u.id, buffer: buf(100) })
    ).rejects.toMatchObject({ status: 413 });
    expect(await prisma.file.count({ where: { ownerId: u.id } })).toBe(0);
    expect(await used(u.id)).toBe(0n);
    expect((await fs.readdir(storagePathFor(""))).length).toBe(before);
  });

  it("transaction ortasında hata olursa (geçersiz klasör) tüm yazımlar geri alınır ve disk temizlenir", async () => {
    const u = await user();
    const before = (await fs.readdir(storagePathFor(""))).length;
    await expect(
      createFileFromBuffer({ name: "c.txt", mimeType: "text/plain", folderId: "yok-boyle-klasor", ownerId: u.id, buffer: buf(10) })
    ).rejects.toBeDefined();
    expect(await prisma.file.count({ where: { ownerId: u.id } })).toBe(0);
    expect(await used(u.id)).toBe(0n);
    expect((await fs.readdir(storagePathFor(""))).length).toBe(before);
  });
});

describe("kota: eski sürümler sayılır", () => {
  it("her yeni sürümün TAM boyutu eklenir (boyut azalsa bile)", async () => {
    const u = await user();
    const f = await createFileFromBuffer({ name: "v.txt", mimeType: "text/plain", folderId: null, ownerId: u.id, buffer: buf(100) });
    await saveNewFileVersion(f, buf(30), u.id);
    expect(await used(u.id)).toBe(130n); // 100 (v1) + 30 (v2): eski sürüm hâlâ diskte
    const fresh = await prisma.file.findUniqueOrThrow({ where: { id: f.id } });
    await saveNewFileVersion(fresh, buf(20), u.id);
    expect(await used(u.id)).toBe(150n);
  });

  it("yeni sürüm kotayı aşıyorsa reddedilir ve yeni sürüm oluşmaz", async () => {
    const u = await user(120n);
    const f = await createFileFromBuffer({ name: "v.txt", mimeType: "text/plain", folderId: null, ownerId: u.id, buffer: buf(100) });
    await expect(saveNewFileVersion(f, buf(30), u.id)).rejects.toMatchObject({ status: 413 });
    expect(await prisma.fileVersion.count({ where: { fileId: f.id } })).toBe(1);
    expect(await used(u.id)).toBe(100n);
  });

  it("sürüm saklama temizliği eski sürümü silince kota düşer", async () => {
    const u = await user();
    const f = await createFileFromBuffer({ name: "v.txt", mimeType: "text/plain", folderId: null, ownerId: u.id, buffer: buf(100) });
    await saveNewFileVersion(f, buf(40), u.id);
    const old = await prisma.fileVersion.findFirstOrThrow({ where: { fileId: f.id, versionNo: 1 } });
    await prisma.fileVersion.update({ where: { id: old.id }, data: { createdAt: new Date(Date.now() - 10 * 86_400_000) } });
    await prisma.systemSettings.upsert({
      where: { id: 1 },
      update: { versionRetentionDays: 5 },
      create: { id: 1, versionRetentionDays: 5 },
    });
    try {
      await runCleanup();
    } finally {
      await prisma.systemSettings.update({ where: { id: 1 }, data: { versionRetentionDays: null } });
    }
    expect(await prisma.fileVersion.count({ where: { fileId: f.id } })).toBe(1);
    expect(await used(u.id)).toBe(40n);
    expect(await exists(old.storageKey)).toBe(false);
  });
});

describe("departman kotası", () => {
  it("kullanıcı kotası uygun olsa da departman toplamı aşılıyorsa reddeder", async () => {
    const dept = await prisma.department.create({ data: { name: `dept-${Date.now()}`, quotaBytes: 150n } });
    departmentIds.push(dept.id);
    const a = await user(1000n, dept.id);
    const b = await user(1000n, dept.id);
    await createFileFromBuffer({ name: "a.txt", mimeType: "text/plain", folderId: null, ownerId: a.id, buffer: buf(100) });
    await expect(
      createFileFromBuffer({ name: "b.txt", mimeType: "text/plain", folderId: null, ownerId: b.id, buffer: buf(60) })
    ).rejects.toMatchObject({ status: 413, message: expect.stringContaining("Departman kotası") });
    await expect(assertQuota(b, 50n)).resolves.toBeUndefined();
  });

  it("departmanı olmayan kullanıcı etkilenmez", async () => {
    const u = await user(1000n);
    await expect(assertQuota(u, 500n)).resolves.toBeUndefined();
  });
});

describe("çöp kutusu: kota ve atomiklik", () => {
  it("silme tüm sürümlerin kotasını serbest bırakır, geri yükleme geri ister", async () => {
    const u = await user();
    const folder = await createTestFolder({ ownerId: u.id });
    const f = await createFileFromBuffer({ name: "s.txt", mimeType: "text/plain", folderId: folder.id, ownerId: u.id, buffer: buf(100) });
    await saveNewFileVersion(f, buf(50), u.id);
    expect(await used(u.id)).toBe(150n);
    await softDeleteFolderRecursive(folder.id);
    expect(await used(u.id)).toBe(0n);
    await restoreFolderRecursive(folder.id);
    expect(await used(u.id)).toBe(150n);
  });

  it("geri yüklemede kota aşılırsa HİÇBİR şey geri yüklenmez (kısmi geri yükleme yok)", async () => {
    const u = await user();
    const folder = await createTestFolder({ ownerId: u.id });
    const sub = await createTestFolder({ ownerId: u.id, parentId: folder.id });
    await createTestFile({ ownerId: u.id, folderId: folder.id, size: 100n });
    await createTestFile({ ownerId: u.id, folderId: sub.id, size: 100n });
    await prisma.user.update({ where: { id: u.id }, data: { usedBytes: 200n } });
    await softDeleteFolderRecursive(folder.id);
    // kota düşürülür: sadece 150 bayt yer var, 200 gerekiyor
    await prisma.user.update({ where: { id: u.id }, data: { quotaBytes: 150n } });
    await expect(restoreFolderRecursive(folder.id)).rejects.toMatchObject({ status: 413 });
    expect((await prisma.folder.findUniqueOrThrow({ where: { id: folder.id } })).deletedAt).not.toBeNull();
    expect((await prisma.folder.findUniqueOrThrow({ where: { id: sub.id } })).deletedAt).not.toBeNull();
    expect(await prisma.file.count({ where: { ownerId: u.id, deletedAt: null } })).toBe(0);
    expect(await used(u.id)).toBe(0n);
  });

  it("çöpteki dosyayı kalıcı silmek kotayı ikinci kez düşürmez ve diski temizler", async () => {
    const u = await user();
    const f = await createFileFromBuffer({ name: "p.txt", mimeType: "text/plain", folderId: null, ownerId: u.id, buffer: buf(100) });
    const version = await prisma.fileVersion.findFirstOrThrow({ where: { fileId: f.id } });
    await prisma.file.update({ where: { id: f.id }, data: { deletedAt: new Date() } });
    await prisma.user.update({ where: { id: u.id }, data: { usedBytes: 0n } });
    await purgeFile(f.id);
    expect(await used(u.id)).toBe(0n);
    expect(await prisma.file.count({ where: { id: f.id } })).toBe(0);
    expect(await exists(version.storageKey)).toBe(false);
  });
});

describe("visibleFileIds (toplu yetki) filePermissionLevel ile aynı sonucu verir", () => {
  it("sahiplik, doğrudan izin, klasör izni (kalıtım), MANAGER departmanı ve yetkisiz durumlar", async () => {
    const dept = await prisma.department.create({ data: { name: `dept-v-${Date.now()}` } });
    departmentIds.push(dept.id);
    const owner = await user();
    const viewer = await user();
    const manager = await createTestUser({ role: "MANAGER", departmentId: dept.id });
    userIds.push(manager.id);
    const stranger = await user();

    const root = await createTestFolder({ ownerId: owner.id, departmentId: dept.id });
    const child = await createTestFolder({ ownerId: owner.id, parentId: root.id, departmentId: dept.id });
    const other = await createTestFolder({ ownerId: owner.id });
    await prisma.folderPermission.create({ data: { folderId: root.id, userId: viewer.id, permission: "VIEW" } });

    const fChild = await createTestFile({ ownerId: owner.id, folderId: child.id });
    const fOther = await createTestFile({ ownerId: owner.id, folderId: other.id });
    const fRoot = await createTestFile({ ownerId: owner.id, folderId: null });
    const fDirect = await createTestFile({ ownerId: owner.id, folderId: other.id });
    await prisma.filePermission.create({ data: { fileId: fDirect.id, userId: stranger.id, permission: "VIEW" } });
    const files = [fChild, fOther, fRoot, fDirect];

    for (const u of [owner, viewer, manager, stranger]) {
      const batch = await visibleFileIds(u, files);
      for (const f of files) {
        const single = (await filePermissionLevel(u, f.id)) !== null;
        expect(batch.has(f.id), `${u.role}/${f.name}`).toBe(single);
      }
    }
    // beklenen somut sonuçlar
    expect((await visibleFileIds(viewer, files)).has(fChild.id)).toBe(true); // kalıtım
    expect((await visibleFileIds(viewer, files)).has(fOther.id)).toBe(false);
    expect((await visibleFileIds(manager, files)).has(fChild.id)).toBe(true); // departman
    expect((await visibleFileIds(stranger, files)).has(fDirect.id)).toBe(true);
    expect((await visibleFileIds(stranger, files)).has(fRoot.id)).toBe(false);
  });
});

describe("POST /api/files (route entegrasyonu)", () => {
  it("yükler, aynı ada tekrar yüklemeyi sürüm yapar, kota aşımında 413 döner", async () => {
    const u = await user(300n);
    vi.resetModules();
    vi.doMock("@/lib/auth", () => ({ requireUser: async () => u, AuthError: class extends Error {} }));
    const { POST } = await import("@/app/api/files/route");
    const send = (name: string, size: number) => {
      const form = new FormData();
      form.set("file", new File([buf(size)], name, { type: "text/plain" }));
      return POST(new Request("http://x/api/files", { method: "POST", body: form }));
    };
    const r1 = await send("route.txt", 100);
    expect(r1.status).toBe(200);
    const r2 = await send("route.txt", 100); // aynı ad -> v2
    expect(r2.status).toBe(200);
    expect((await r2.json()).id).toBe((await r1.json()).id);
    expect(await used(u.id)).toBe(200n);
    const r3 = await send("route2.txt", 150); // 200 + 150 > 300
    expect(r3.status).toBe(413);
    expect(await prisma.file.count({ where: { ownerId: u.id } })).toBe(1);
    vi.doUnmock("@/lib/auth");
  });
});
