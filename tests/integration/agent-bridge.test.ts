import { describe, it, expect, afterEach, afterAll, vi, beforeEach } from "vitest";
import { rmSync } from "fs";
import { prisma } from "@/lib/prisma";
import { createFileFromBuffer } from "@/lib/file-versions";
import { MAX_ACTIVE_TOKENS, agentLabel, authenticateAgent, createApiToken, hashToken } from "@/lib/agent-token";
import { AgentUploadError, agentUpload, validFileName } from "@/lib/agent-upload";
import { createTestUser, createTestFolder, cleanupTestData } from "../helpers/db";

// Yapay zekâ köprüsü: erişim anahtarı doğrulaması (süre/iptal/pasif hesap), anahtarın yalnızca kendi kullanıcısı adına
// çalışması, yüklemenin normal yüklemeyle aynı yetki/kota/politika kurallarına uyması ve AI_UPLOAD bildirimi.
vi.hoisted(() => {
  process.env.STORAGE_ROOT = "./.test-storage-agent-bridge";
});
afterAll(() => rmSync("./.test-storage-agent-bridge", { recursive: true, force: true }));

let userIds: string[] = [];
beforeEach(() => {
  process.env.SESSION_SECRET = "test-secret-test-secret-test-secret-123";
});
afterEach(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: userIds }, type: "AI_UPLOAD" } });
  await prisma.apiToken.deleteMany({ where: { userId: { in: userIds } } });
  await cleanupTestData({ userIds });
  userIds = [];
});

async function user(role: "ADMIN" | "MEMBER" = "MEMBER") {
  const u = await createTestUser({ role });
  userIds.push(u.id);
  return prisma.user.findUniqueOrThrow({ where: { id: u.id } });
}
const req = (token?: string, agent?: string) =>
  new Request("http://x/api/agent/me", { headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(agent ? { "x-cdrive-agent": agent } : {}) } });

describe("erişim anahtarı doğrulaması", () => {
  it("geçerli anahtar kullanıcıyı çözer; veritabanında yalnızca özet var", async () => {
    const u = await user();
    const { token, row } = await createApiToken(u.id, "Claude Code");
    expect(token.startsWith("cdrv_")).toBe(true);
    expect(row.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(row)).not.toContain(token);
    const auth = await authenticateAgent(req(token, "codex"));
    expect(auth.user.id).toBe(u.id);
    expect(auth.agent).toBe("Codex");
  });

  it("anahtarsız, bozuk biçimli, bilinmeyen anahtar → 401", async () => {
    await expect(authenticateAgent(req())).rejects.toMatchObject({ status: 401 });
    await expect(authenticateAgent(req("abc"))).rejects.toMatchObject({ status: 401 });
    await expect(authenticateAgent(req("cdrv_" + "x".repeat(43)))).rejects.toMatchObject({ status: 401 });
    // oturum çerezi/JWT benzeri bir değer anahtar sayılmaz
    await expect(authenticateAgent(req("eyJhbGciOiJIUzI1NiJ9.eyJ1aWQiOiJ4In0.sig"))).rejects.toMatchObject({ status: 401 });
  });

  it("iptal edilmiş ve süresi dolmuş anahtar reddedilir", async () => {
    const u = await user();
    const a = await createApiToken(u.id, "iptal");
    await prisma.apiToken.update({ where: { id: a.row.id }, data: { revokedAt: new Date() } });
    await expect(authenticateAgent(req(a.token))).rejects.toMatchObject({ status: 401 });

    const b = await createApiToken(u.id, "süre");
    await prisma.apiToken.update({ where: { id: b.row.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(authenticateAgent(req(b.token))).rejects.toMatchObject({ status: 401 });
  });

  it("pasifleştirilen veya şifre değişimi bekleyen hesabın anahtarı çalışmaz", async () => {
    const u = await user();
    const { token } = await createApiToken(u.id, "x");
    await prisma.user.update({ where: { id: u.id }, data: { active: false } });
    await expect(authenticateAgent(req(token))).rejects.toMatchObject({ status: 401 });
    await prisma.user.update({ where: { id: u.id }, data: { active: true, mustChangePassword: true } });
    await expect(authenticateAgent(req(token))).rejects.toMatchObject({ status: 403 });
  });

  it("kullanıcı başına etkin anahtar sayısı sınırlıdır; süre en çok 365 gün", async () => {
    const u = await user();
    for (let i = 0; i < MAX_ACTIVE_TOKENS; i++) await createApiToken(u.id, `k${i}`);
    await expect(createApiToken(u.id, "fazla")).rejects.toMatchObject({ status: 400 });
    const v = await user();
    const { row } = await createApiToken(v.id, "uzun", 99999);
    expect(row.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(366 * 86_400_000);
  });

  it("ajan etiketi bildirime/denetime girmeden önce temizlenir", () => {
    expect(agentLabel("claude-code")).toBe("Claude Code");
    expect(agentLabel("CODEX")).toBe("Codex");
    const evil = "Evil" + String.fromCharCode(10) + '"; DROP <script>alert(1)</script>';
    const clean = agentLabel(evil);
    expect(clean).not.toMatch(/[<>"\n]/);
    expect(clean.length).toBeLessThanOrEqual(40);
    expect(agentLabel("")).toBe("Yapay zekâ aracı");
    expect(agentLabel(null)).toBe("Yapay zekâ aracı");
  });
});

describe("yükleme", () => {
  it("ana klasöre yükler, bildirim ve denetim kaydı yazar", async () => {
    const u = await user();
    const r = await agentUpload({ user: u, agent: "Claude Code", name: `tablo-${u.id.slice(-6)}.xlsx`, mimeType: "application/octet-stream", buffer: Buffer.from("PK-sahte-xlsx"), folderId: null });
    expect(r.versioned).toBe(false);
    const f = await prisma.file.findUniqueOrThrow({ where: { id: r.id } });
    expect(f.ownerId).toBe(u.id);
    expect(f.folderId).toBeNull();
    const n = await prisma.notification.findFirstOrThrow({ where: { userId: u.id, type: "AI_UPLOAD" } });
    expect(n.message).toContain("Claude Code");
    expect(n.message).toContain("tablo-");
    expect(n.read).toBe(false);
    expect(n.targetType).toBe("drive_root");
    const audit = await prisma.auditLog.findFirst({ where: { userId: u.id, action: "UPLOAD", targetId: r.id } });
    expect(audit?.detail).toContain("(Claude Code)");
  });

  it("aynı adlı dosya varsa yeni sürüm olur (eski sürüm korunur)", async () => {
    const u = await user();
    const name = `rapor-${u.id.slice(-6)}.csv`;
    const first = await agentUpload({ user: u, agent: "Codex", name, mimeType: "text/csv", buffer: Buffer.from("a,b\n1,2\n"), folderId: null });
    const second = await agentUpload({ user: u, agent: "Codex", name, mimeType: "text/csv", buffer: Buffer.from("a,b\n3,4\n"), folderId: null });
    expect(second.id).toBe(first.id);
    expect(second.versioned).toBe(true);
    expect(await prisma.fileVersion.count({ where: { fileId: first.id } })).toBe(2);
    expect(await prisma.file.count({ where: { ownerId: u.id, name, deletedAt: null } })).toBe(1);
  });

  it("başkasının klasörüne yüklemez (403) ve başkasının kök dosyasının üzerine yazmaz", async () => {
    const owner = await user();
    const other = await user();
    const folder = await createTestFolder({ ownerId: owner.id, name: `ozel-${owner.id.slice(-6)}` });
    await expect(
      agentUpload({ user: other, agent: "Codex", name: "x.txt", mimeType: "text/plain", buffer: Buffer.from("x"), folderId: folder.id })
    ).rejects.toMatchObject({ status: 403 });
    expect(await prisma.file.count({ where: { folderId: folder.id } })).toBe(0);

    const name = `ortak-${owner.id.slice(-6)}.txt`;
    const mine = await createFileFromBuffer({ name, mimeType: "text/plain", folderId: null, ownerId: owner.id, buffer: Buffer.from("benim") });
    const r = await agentUpload({ user: other, agent: "Codex", name, mimeType: "text/plain", buffer: Buffer.from("baskasi"), folderId: null });
    expect(r.id).not.toBe(mine.id); // kökte yalnızca kendi dosyan eşleşir
    expect(await prisma.fileVersion.count({ where: { fileId: mine.id } })).toBe(1);
  });

  it("geçersiz ad, boş dosya, büyük dosya reddedilir; yasaklı uzantı politikayla engellenir", async () => {
    const u = await user();
    const bs = String.fromCharCode(92);
    for (const bad of ["", " ", "..", "a/b.txt", `a${bs}b.txt`, "a:b.txt", "a?.txt", "x".repeat(201), "a" + String.fromCharCode(0) + ".txt"]) {
      expect(validFileName(bad), JSON.stringify(bad)).toBe(false);
      await expect(agentUpload({ user: u, agent: "Codex", name: bad, mimeType: "text/plain", buffer: Buffer.from("x"), folderId: null })).rejects.toBeInstanceOf(AgentUploadError);
    }
    expect(validFileName("Tablo (1).xlsx")).toBe(true);
    await expect(agentUpload({ user: u, agent: "Codex", name: "bos.txt", mimeType: "text/plain", buffer: Buffer.alloc(0), folderId: null })).rejects.toMatchObject({ status: 400 });

    await prisma.systemSettings.upsert({ where: { id: 1 }, create: { id: 1, blockedExtensions: ".exe" }, update: { blockedExtensions: ".exe" } });
    try {
      await expect(agentUpload({ user: u, agent: "Codex", name: "kotu.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ"), folderId: null })).rejects.toMatchObject({ status: 400 });
    } finally {
      await prisma.systemSettings.update({ where: { id: 1 }, data: { blockedExtensions: null } });
    }
  });

  it("kota dolmuşsa yükleme reddedilir ve bildirim oluşmaz", async () => {
    const u = await user();
    await prisma.user.update({ where: { id: u.id }, data: { quotaBytes: 10n, usedBytes: 10n } });
    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    await expect(agentUpload({ user: fresh, agent: "Codex", name: "buyuk.txt", mimeType: "text/plain", buffer: Buffer.from("x".repeat(50)), folderId: null })).rejects.toBeTruthy();
    expect(await prisma.notification.count({ where: { userId: u.id, type: "AI_UPLOAD" } })).toBe(0);
  });
});
