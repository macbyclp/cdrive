import { describe, it, expect, afterEach, afterAll, vi } from "vitest";
import { rmSync } from "fs";
import AdmZip from "adm-zip";
import { prisma } from "@/lib/prisma";
import { createFileFromBuffer } from "@/lib/file-versions";
import { signOfficeContentToken } from "@/lib/onlyoffice";
import { createTestUser, createTestFolder, cleanupTestData } from "../helpers/db";

// Bu dosya AYRI bir depolama dizini kullanır: diğer entegrasyon testleri (ör. "yetim dosya bırakmaz")
// depolama klasörünün dosya sayısını ölçüyor; paralel çalışırken aynı klasöre yazmak onları bozardı.
// vi.hoisted, import'lardan ÖNCE çalışır (storage kökü modül yüklenirken sabitlenir).
const STORAGE_DIR = vi.hoisted(() => {
  const dir = "./.test-storage-security";
  process.env.STORAGE_ROOT = dir;
  return dir;
});

afterAll(() => {
  rmSync(STORAGE_DIR, { recursive: true, force: true });
});

// Güvenlik denetimi düzeltmeleri için gerileme testleri: her biri, düzeltmeden ÖNCE mümkün olan
// bir saldırı akışının artık engellendiğini doğrular.

let userIds: string[] = [];

afterEach(async () => {
  vi.doUnmock("@/lib/auth");
  vi.resetModules();
  await prisma.systemSettings.updateMany({ where: { id: 1 }, data: { blockedExtensions: null } });
  await cleanupTestData({ userIds });
  userIds = [];
  delete process.env.ONLYOFFICE_URL;
  delete process.env.ONLYOFFICE_JWT_SECRET;
});

async function user() {
  const u = await createTestUser();
  userIds.push(u.id);
  return prisma.user.findUniqueOrThrow({ where: { id: u.id } });
}

function asUser(u: { id: string }) {
  vi.resetModules();
  vi.doMock("@/lib/auth", () => ({
    requireUser: async () => prisma.user.findUniqueOrThrow({ where: { id: u.id } }),
    requireUnrestrictedUser: async () => prisma.user.findUniqueOrThrow({ where: { id: u.id } }),
    AuthError: class extends Error {},
  }));
}

const upload = (name: string, body: string, type = "text/plain") => {
  const form = new FormData();
  form.set("file", new File([body], name, { type }));
  return new Request("http://x/api/files", { method: "POST", body: form });
};

describe("kök dizinde aynı adlı yükleme başkasının dosyasını ezmez", () => {
  it("B kullanıcısı A'nın kök dosyasıyla aynı adı yüklerse A'nın dosyası DEĞİŞMEZ", async () => {
    const a = await user();
    const b = await user();
    const victim = await createFileFromBuffer({
      name: "kurban.txt",
      mimeType: "text/plain",
      folderId: null,
      ownerId: a.id,
      buffer: Buffer.from("orijinal"),
    });
    asUser(b);
    const { POST } = await import("@/app/api/files/route");
    const res = await POST(upload("kurban.txt", "saldirgan icerigi"));
    expect(res.status).toBe(200);
    const created = await res.json();
    expect(created.id).not.toBe(victim.id); // yeni, kendi dosyası
    expect(created.ownerId).toBe(b.id);
    const after = await prisma.file.findUniqueOrThrow({ where: { id: victim.id }, include: { versions: true } });
    expect(after.versions).toHaveLength(1);
    expect(after.currentVersionId).toBe(victim.currentVersionId);
  });

  it("kullanıcı kendi kök dosyasına aynı adla yüklerse yeni sürüm olur (mevcut davranış korunur)", async () => {
    const a = await user();
    const first = await createFileFromBuffer({ name: "x.txt", mimeType: "text/plain", folderId: null, ownerId: a.id, buffer: Buffer.from("1") });
    asUser(a);
    const { POST } = await import("@/app/api/files/route");
    const res = await POST(upload("x.txt", "2"));
    expect((await res.json()).id).toBe(first.id);
  });
});

describe("ZIP yükleme başkasının klasörüne yazmaz", () => {
  it("ZIP içindeki klasör adı başkasının kök klasörüyle eşleşirse o klasör KULLANILMAZ", async () => {
    const a = await user();
    const b = await user();
    const victimFolder = await createTestFolder({ ownerId: a.id, name: `paylasilmayan-${a.id.slice(-6)}` });
    const zip = new AdmZip();
    zip.addFile(`${victimFolder.name}/sizinti.txt`, Buffer.from("icerik"));
    asUser(b);
    const { POST } = await import("@/app/api/files/zip-upload/route");
    const form = new FormData();
    form.set("file", new File([new Uint8Array(zip.toBuffer())], "a.zip", { type: "application/zip" }));
    const res = await POST(new Request("http://x/api/files/zip-upload", { method: "POST", body: form }));
    expect(res.status).toBe(200);
    // A'nın klasörüne HİÇBİR dosya yazılmadı
    expect(await prisma.file.count({ where: { folderId: victimFolder.id } })).toBe(0);
    // dosya B'nin kendi (yeni) klasörüne gitti
    const mine = await prisma.file.findFirstOrThrow({ where: { ownerId: b.id, name: "sizinti.txt" }, include: { folder: true } });
    expect(mine.folder?.id).not.toBe(victimFolder.id);
    expect(mine.folder?.ownerId).toBe(b.id);
  });

  it("aşırı sıkıştırılmış (ZIP bombası benzeri) arşiv belleğe açılmadan reddedilir", async () => {
    const a = await user();
    const zip = new AdmZip();
    zip.addFile("bomba.bin", Buffer.alloc(8 * 1024 * 1024, 0)); // 8 MB sıfır → çok yüksek oran
    asUser(a);
    const { POST } = await import("@/app/api/files/zip-upload/route");
    const form = new FormData();
    form.set("file", new File([new Uint8Array(zip.toBuffer())], "b.zip", { type: "application/zip" }));
    const res = await POST(new Request("http://x/api/files/zip-upload", { method: "POST", body: form }));
    expect(res.status).toBe(400);
    expect(await prisma.file.count({ where: { ownerId: a.id } })).toBe(0);
  });
});

describe("dosya sunumu ve yeniden adlandırma", () => {
  it("HTML/SVG ?inline=1 ile bile 'attachment' olarak sunulur; PNG inline kalır", async () => {
    const a = await user();
    const html = await createFileFromBuffer({ name: "x.html", mimeType: "text/html", folderId: null, ownerId: a.id, buffer: Buffer.from("<script>1</script>") });
    const svg = await createFileFromBuffer({ name: "x.svg", mimeType: "image/svg+xml", folderId: null, ownerId: a.id, buffer: Buffer.from("<svg/>") });
    const png = await createFileFromBuffer({ name: "x.png", mimeType: "image/png", folderId: null, ownerId: a.id, buffer: Buffer.from("png") });
    asUser(a);
    const { GET } = await import("@/app/api/files/[id]/route");
    const get = (id: string) => GET(new Request(`http://x/api/files/${id}?inline=1`), { params: Promise.resolve({ id }) });
    expect((await get(html.id)).headers.get("content-disposition")).toMatch(/^attachment/);
    expect((await get(svg.id)).headers.get("content-disposition")).toMatch(/^attachment/);
    expect((await get(png.id)).headers.get("content-disposition")).toMatch(/^inline/);
  });

  it("yasaklı uzantıya yeniden adlandırma politika tarafından reddedilir", async () => {
    const a = await user();
    const f = await createFileFromBuffer({ name: "a.txt", mimeType: "text/plain", folderId: null, ownerId: a.id, buffer: Buffer.from("x") });
    await prisma.systemSettings.upsert({ where: { id: 1 }, create: { id: 1, blockedExtensions: ".exe" }, update: { blockedExtensions: ".exe" } });
    asUser(a);
    const { PATCH } = await import("@/app/api/files/[id]/route");
    const res = await PATCH(
      new Request(`http://x/api/files/${f.id}`, { method: "PATCH", body: JSON.stringify({ name: "a.exe" }) }),
      { params: Promise.resolve({ id: f.id }) }
    );
    expect(res.status).toBe(400);
    expect((await prisma.file.findUniqueOrThrow({ where: { id: f.id } })).name).toBe("a.txt");
  });
});

describe("OnlyOffice callback", () => {
  async function officeToken(fileId: string, versionId: string, userId: string) {
    return signOfficeContentToken({ fileId, versionId, userId });
  }
  const callback = async (fileId: string, token: string, body: unknown) => {
    const { POST } = await import("@/app/api/files/[id]/office/callback/route");
    return POST(
      new Request(`http://x/api/files/${fileId}/office/callback?token=${token}`, { method: "POST", body: JSON.stringify(body) }),
      { params: Promise.resolve({ id: fileId }) }
    );
  };

  it("yalnızca VIEW izni olan kullanıcı callback ile kaydedemez (EDIT şart)", async () => {
    process.env.ONLYOFFICE_URL = "https://office.example.test";
    const owner = await user();
    const viewer = await user();
    const f = await createFileFromBuffer({ name: "d.docx", mimeType: "application/octet-stream", folderId: null, ownerId: owner.id, buffer: Buffer.from("v1") });
    await prisma.filePermission.create({ data: { fileId: f.id, userId: viewer.id, permission: "VIEW" } });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const token = await officeToken(f.id, f.currentVersionId!, viewer.id);
    const res = await callback(f.id, token, { status: 2, url: "https://office.example.test/cache/x.docx" });
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("SSRF: düzenleme yetkisi olsa bile güvenilen Document Server dışındaki adrese istek atılmaz", async () => {
    process.env.ONLYOFFICE_URL = "https://office.example.test";
    const owner = await user();
    const f = await createFileFromBuffer({ name: "d.docx", mimeType: "application/octet-stream", folderId: null, ownerId: owner.id, buffer: Buffer.from("v1") });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const token = await officeToken(f.id, f.currentVersionId!, owner.id);
    for (const url of ["http://127.0.0.1:3306/", "http://169.254.169.254/latest/meta-data", "https://evil.example.test/x", "file:///etc/passwd"]) {
      const res = await callback(f.id, token, { status: 2, url });
      expect(res.status).toBe(400);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    expect(await prisma.fileVersion.count({ where: { fileId: f.id } })).toBe(1);
  });
});
