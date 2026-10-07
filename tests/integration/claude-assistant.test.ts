import { describe, it, expect, afterEach, afterAll, vi, beforeEach } from "vitest";
import { rmSync } from "fs";
import { prisma } from "@/lib/prisma";
import { createFileFromBuffer } from "@/lib/file-versions";
import { ToolError, toolListFolder, toolProposeEdit, toolProposeNewFile, toolRead, toolSearch } from "@/lib/claude-tools";
import { createTestUser, createTestFolder, cleanupTestData } from "../helpers/db";

// Claude yardımcısının güvenlik sınırları: her araç, sohbeti başlatan kullanıcının yetkileriyle çalışır;
// Claude kullanıcının göremediği veriyi göremez, düzenleme yetkisi olmadığı dosya için öneri bile kaydedemez.
// Ayrı depolama dizini: diğer testlerin depolama sayımlarını bozmamak için.
const STORAGE_DIR = vi.hoisted(() => {
  const dir = "./.test-storage-claude";
  process.env.STORAGE_ROOT = dir;
  return dir;
});

let userIds: string[] = [];

beforeEach(() => {
  process.env.SESSION_SECRET = "test-secret-test-secret-test-secret-123";
});

afterEach(async () => {
  await prisma.claudeProposal.deleteMany({ where: { userId: { in: userIds } } });
  await cleanupTestData({ userIds });
  userIds = [];
  vi.resetModules();
});

async function user(role: "ADMIN" | "MEMBER" = "MEMBER") {
  const u = await createTestUser({ role });
  userIds.push(u.id);
  return prisma.user.findUniqueOrThrow({ where: { id: u.id } });
}

const file = (owner: { id: string }, name: string, text: string, folderId: string | null = null) =>
  createFileFromBuffer({ name, mimeType: "text/plain", folderId, ownerId: owner.id, buffer: Buffer.from(text) });

describe("araçlar kullanıcının yetkileriyle sınırlı", () => {
  it("MEMBER başkasının dosyasını OKUYAMAZ, aramada GÖREMEZ, klasörünü LİSTELEYEMEZ", async () => {
    const owner = await user();
    const other = await user();
    const folder = await createTestFolder({ ownerId: owner.id, name: `gizli-${owner.id.slice(-6)}` });
    const secret = await file(owner, `maas-listesi-${owner.id.slice(-6)}.txt`, "çok gizli içerik", folder.id);

    await expect(toolRead(other, secret.id)).rejects.toMatchObject({ status: 403 });
    await expect(toolListFolder(other, folder.id)).rejects.toMatchObject({ status: 403 });
    const found = await toolSearch(other, `maas-listesi-${owner.id.slice(-6)}`);
    expect(found.files).toHaveLength(0);

    // sahibi görebilir (aynı araçlar, farklı yetki)
    expect((await toolRead(owner, secret.id)).content).toBe("çok gizli içerik");
    expect((await toolSearch(owner, `maas-listesi-${owner.id.slice(-6)}`)).files).toHaveLength(1);
  });

  it("ADMIN tüm dosyaları görebilir", async () => {
    const owner = await user();
    const admin = await user("ADMIN");
    const f = await file(owner, `admin-gorur-${owner.id.slice(-6)}.txt`, "içerik");
    expect((await toolRead(admin, f.id)).name).toContain("admin-gorur");
  });

  it("kök listesi başkasının kök DOSYALARINI göstermez", async () => {
    const a = await user();
    const b = await user();
    await file(a, `a-koku-${a.id.slice(-6)}.txt`, "x");
    const listB = await toolListFolder(b, null);
    expect(listB.files.some((f) => f.name.includes(`a-koku-${a.id.slice(-6)}`))).toBe(false);
  });

  it("silinmiş dosya okunamaz", async () => {
    const u = await user();
    const f = await file(u, "silinmis.txt", "x");
    await prisma.file.update({ where: { id: f.id }, data: { deletedAt: new Date() } });
    await expect(toolRead(u, f.id)).rejects.toMatchObject({ status: 404 });
  });

  it("uzun dosya parça parça okunur (truncated + offset)", async () => {
    const u = await user();
    const big = "a".repeat(130_000);
    const f = await file(u, "uzun.txt", big);
    const first = await toolRead(u, f.id);
    expect(first.truncated).toBe(true);
    expect(first.content.length).toBe(60_000);
    const last = await toolRead(u, f.id, 120_000);
    expect(last.truncated).toBe(false);
    expect(last.content.length).toBe(10_000);
  });
});

describe("öneriler (Claude dosyaya yazamaz)", () => {
  it("propose_edit dosyayı DEĞİŞTİRMEZ; yalnızca öneri kaydeder", async () => {
    const u = await user();
    const f = await file(u, "belge.txt", "eski");
    const out = await toolProposeEdit(u, { fileId: f.id, content: "yeni", summary: "deneme" });
    expect(out.status).toBe("PENDING");
    const after = await prisma.file.findUniqueOrThrow({ where: { id: f.id }, include: { versions: true } });
    expect(after.versions).toHaveLength(1);
    expect(after.currentVersionId).toBe(f.currentVersionId);
    expect((await prisma.claudeProposal.findUniqueOrThrow({ where: { id: out.proposalId } })).baseVersionId).toBe(f.currentVersionId);
  });

  it("EDIT yetkisi olmayan dosya için öneri bile kaydedilemez (VIEW yetkisi yetmez)", async () => {
    const owner = await user();
    const viewer = await user();
    const f = await file(owner, "salt-okunur.txt", "x");
    await prisma.filePermission.create({ data: { fileId: f.id, userId: viewer.id, permission: "VIEW" } });
    expect((await toolRead(viewer, f.id)).content).toBe("x"); // okuyabilir
    await expect(toolProposeEdit(viewer, { fileId: f.id, content: "kötü" })).rejects.toMatchObject({ status: 403 });
    expect(await prisma.claudeProposal.count({ where: { userId: viewer.id } })).toBe(0);
  });

  it("düz metin olmayan (Word/PDF/Excel) dosya için düzenleme önerilemez", async () => {
    const u = await user();
    const f = await createFileFromBuffer({
      name: "rapor.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      folderId: null,
      ownerId: u.id,
      buffer: Buffer.from("PK"),
    });
    await expect(toolProposeEdit(u, { fileId: f.id, content: "x" })).rejects.toBeInstanceOf(ToolError);
  });

  it("yeni dosya önerisi: geçersiz ad, yasak uzantı ve yetkisiz klasör reddedilir", async () => {
    const owner = await user();
    const other = await user();
    const folder = await createTestFolder({ ownerId: owner.id, name: `k-${owner.id.slice(-6)}` });
    for (const name of ["../x.txt", "a/b.txt", "", "x.exe", "x.docx"]) {
      await expect(toolProposeNewFile(other, { name, content: "x" })).rejects.toBeInstanceOf(ToolError);
    }
    await expect(toolProposeNewFile(other, { name: "ok.txt", content: "x", folderId: folder.id })).rejects.toMatchObject({ status: 403 });
    expect((await toolProposeNewFile(other, { name: "ok.txt", content: "x" })).status).toBe("PENDING");
  });

  it("bekleyen öneri sayısı sınırlıdır (spam koruması)", async () => {
    const u = await user();
    const f = await file(u, "spam.txt", "x");
    for (let i = 0; i < 20; i++) await toolProposeEdit(u, { fileId: f.id, content: `v${i}` });
    await expect(toolProposeEdit(u, { fileId: f.id, content: "21." })).rejects.toBeInstanceOf(ToolError);
  });
});

describe("öneri uygulama / reddetme uç noktası", () => {
  function asUser(u: { id: string }) {
    vi.resetModules();
    vi.doMock("@/lib/auth", () => ({
      requireUser: async () => prisma.user.findUniqueOrThrow({ where: { id: u.id } }),
      AuthError: class extends Error {},
    }));
  }
  const decide = async (id: string, action: "apply" | "reject") => {
    const { POST } = await import("@/app/api/claude/proposals/[id]/route");
    return POST(new Request("http://x", { method: "POST", body: JSON.stringify({ action }) }), { params: Promise.resolve({ id }) });
  };

  afterEach(() => {
    vi.doUnmock("@/lib/auth");
  });

  it("uygula: yeni sürüm olarak yazılır, bir kez uygulanır", async () => {
    const u = await user();
    const f = await file(u, "uygula.txt", "eski");
    const { proposalId } = await toolProposeEdit(u, { fileId: f.id, content: "yeni içerik" });
    asUser(u);
    const res = await decide(proposalId, "apply");
    expect(res.status).toBe(200);
    const after = await prisma.file.findUniqueOrThrow({ where: { id: f.id }, include: { versions: true } });
    expect(after.versions).toHaveLength(2);
    expect((await decide(proposalId, "apply")).status).toBe(409); // çift uygulama yok
    expect(await prisma.fileVersion.count({ where: { fileId: f.id } })).toBe(2);
  });

  it("dosya öneriden sonra değiştiyse uygulanmaz (409) ve öneri bekleyen kalır", async () => {
    const u = await user();
    const f = await file(u, "bayat.txt", "v1");
    const { proposalId } = await toolProposeEdit(u, { fileId: f.id, content: "öneri" });
    const { saveNewFileVersion } = await import("@/lib/file-versions");
    await saveNewFileVersion(f, Buffer.from("başkası değiştirdi"), u.id);
    asUser(u);
    expect((await decide(proposalId, "apply")).status).toBe(409);
    expect((await prisma.claudeProposal.findUniqueOrThrow({ where: { id: proposalId } })).status).toBe("PENDING");
  });

  it("uygulama anında EDIT yetkisi yeniden doğrulanır (izin sonradan kaldırıldıysa 403)", async () => {
    const owner = await user();
    const editor = await user();
    const f = await file(owner, "yetki.txt", "x");
    const perm = await prisma.filePermission.create({ data: { fileId: f.id, userId: editor.id, permission: "EDIT" } });
    const { proposalId } = await toolProposeEdit(editor, { fileId: f.id, content: "y" });
    await prisma.filePermission.delete({ where: { id: perm.id } });
    asUser(editor);
    expect((await decide(proposalId, "apply")).status).toBe(403);
    expect(await prisma.fileVersion.count({ where: { fileId: f.id } })).toBe(1);
  });

  it("başkasının önerisi görülemez/uygulanamaz (404)", async () => {
    const a = await user();
    const b = await user();
    const f = await file(a, "benim.txt", "x");
    const { proposalId } = await toolProposeEdit(a, { fileId: f.id, content: "y" });
    asUser(b);
    expect((await decide(proposalId, "apply")).status).toBe(404);
    const { GET } = await import("@/app/api/claude/proposals/[id]/route");
    expect((await GET(new Request("http://x"), { params: Promise.resolve({ id: proposalId }) })).status).toBe(404);
  });

  it("reddet: dosya değişmez", async () => {
    const u = await user();
    const f = await file(u, "reddet.txt", "x");
    const { proposalId } = await toolProposeEdit(u, { fileId: f.id, content: "y" });
    asUser(u);
    expect((await decide(proposalId, "reject")).status).toBe(200);
    expect(await prisma.fileVersion.count({ where: { fileId: f.id } })).toBe(1);
  });

  it("yeni dosya önerisi onaylanınca oluşturulur; aynı ad varsa (2) eklenir", async () => {
    const u = await user();
    await file(u, "yeni.txt", "mevcut");
    const { proposalId } = await toolProposeNewFile(u, { name: "yeni.txt", content: "claude yazdı" });
    asUser(u);
    const res = await decide(proposalId, "apply");
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("yeni (2).txt");
    expect(await prisma.file.count({ where: { ownerId: u.id } })).toBe(2);
  });
});

afterAll(() => {
  rmSync(STORAGE_DIR, { recursive: true, force: true });
});
