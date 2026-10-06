import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { createHmac, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { replaceRecoveryCodes, consumeRecoveryCode, countRemainingRecoveryCodes } from "@/lib/recovery-codes";
import { verifySecondFactor } from "@/lib/two-factor";
import { generateTotpSecret } from "@/lib/totp";
import { createTestUser, createTestFolder, cleanupTestData } from "../helpers/db";

/** Gerçek MySQL'e karşı: atomiklik/yarış garantileri mock'larla kanıtlanamaz. */

let userIds: string[] = [];
afterEach(async () => {
  await cleanupTestData({ userIds });
  userIds = [];
});
async function user() {
  const u = await createTestUser();
  userIds.push(u.id);
  return u;
}

const b32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function totp(secret: string, t = Date.now() / 1000) {
  let bits = 0, val = 0;
  const bytes: number[] = [];
  for (const ch of secret) {
    val = (val << 5) | b32.indexOf(ch);
    bits += 5;
    if (bits >= 8) { bytes.push((val >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(Math.floor(t / 30)));
  const h = createHmac("sha1", Buffer.from(bytes)).update(buf).digest();
  const o = h[h.length - 1] & 0xf;
  return String((((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1_000_000).padStart(6, "0");
}

describe("kurtarma kodları (gerçek DB)", () => {
  it("10 kod üretir; yeniden üretmek eskileri geçersiz kılar", async () => {
    const u = await user();
    const first = await replaceRecoveryCodes(u.id);
    expect(first).toHaveLength(10);
    expect(await countRemainingRecoveryCodes(u.id)).toBe(10);
    const second = await replaceRecoveryCodes(u.id);
    expect(await consumeRecoveryCode(u.id, first[0])).toBe(false); // eski set artık geçersiz
    expect(await consumeRecoveryCode(u.id, second[0])).toBe(true);
    expect(await countRemainingRecoveryCodes(u.id)).toBe(9);
  });

  it("aynı kodu EŞZAMANLI deneyen 8 istekten yalnız biri geçer", async () => {
    const u = await user();
    const [code] = await replaceRecoveryCodes(u.id);
    const results = await Promise.all(Array.from({ length: 8 }, () => consumeRecoveryCode(u.id, code)));
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("başka kullanıcının kodu kabul edilmez", async () => {
    const a = await user();
    const b = await user();
    const [codeA] = await replaceRecoveryCodes(a.id);
    await replaceRecoveryCodes(b.id);
    expect(await consumeRecoveryCode(b.id, codeA)).toBe(false);
  });
});

describe("TOTP tekrar kullanım koruması (gerçek DB)", () => {
  it("aynı kod ikinci kez 'replay'; eşzamanlı iki denemeden yalnız biri geçer", async () => {
    const u = await user();
    const secret = generateTotpSecret();
    await prisma.user.update({ where: { id: u.id }, data: { twoFactorSecret: secret, twoFactorEnabled: true } });
    const code = totp(secret);
    const fresh = () => prisma.user.findUniqueOrThrow({ where: { id: u.id } });

    const [r1, r2] = await Promise.all([verifySecondFactor(await fresh(), code), verifySecondFactor(await fresh(), code)]);
    expect([r1.ok, r2.ok].filter(Boolean)).toHaveLength(1);
    const loser = [r1, r2].find((r) => !r.ok)!;
    expect(loser).toMatchObject({ ok: false, reason: "replay" });

    expect(await verifySecondFactor(await fresh(), code)).toMatchObject({ ok: false, reason: "replay" });
  });

  it("daha ESKİ bir zaman adımının kodu, yeni adım kullanıldıktan sonra kabul edilmez", async () => {
    const u = await user();
    const secret = generateTotpSecret();
    await prisma.user.update({ where: { id: u.id }, data: { twoFactorSecret: secret, twoFactorEnabled: true } });
    const fresh = () => prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect((await verifySecondFactor(await fresh(), totp(secret))).ok).toBe(true);
    expect(await verifySecondFactor(await fresh(), totp(secret, Date.now() / 1000 - 30))).toMatchObject({ ok: false });
  });
});

describe("/api/setup kilidi (GET_LOCK)", () => {
  it("adlandırılmış kilit iki transaction'ı serileştirir", async () => {
    const order: string[] = [];
    const run = (name: string) =>
      prisma.$transaction(
        async (tx) => {
          const [lock] = await tx.$queryRaw<{ got: number | bigint | null }[]>`SELECT GET_LOCK('cdrive_test_lock', 10) AS got`;
          expect(Number(lock.got)).toBe(1);
          order.push(`${name}:in`);
          await new Promise((r) => setTimeout(r, 250));
          order.push(`${name}:out`);
          await tx.$queryRaw`SELECT RELEASE_LOCK('cdrive_test_lock')`;
        },
        { timeout: 20_000 }
      );
    await Promise.all([run("a"), run("b")]);
    // İç içe girme yok: biri tamamen bitmeden diğeri içeri girmez.
    expect(order[0].endsWith(":in")).toBe(true);
    expect(order[1]).toBe(order[0].replace(":in", ":out"));
  });
});

describe("dosya isteği (gerçek DB, uçtan uca)", () => {
  async function setup(over: Partial<{ maxFiles: number; expiresAt: Date; password: string; maxFileBytes: bigint }> = {}) {
    const owner = await user();
    const folder = await createTestFolder({ ownerId: owner.id });
    const token = randomBytes(12).toString("base64url");
    const req = await prisma.uploadRequest.create({
      data: {
        token,
        folderId: folder.id,
        createdById: owner.id,
        title: "Belgeler",
        expiresAt: over.expiresAt ?? new Date(Date.now() + 3600_000),
        maxFiles: over.maxFiles ?? 5,
        maxFileBytes: over.maxFileBytes ?? 1024n * 1024n,
        passwordHash: over.password ? await bcrypt.hash(over.password, 4) : null,
      },
    });
    return { owner, folder, req, token };
  }
  const ctx = (token: string) => ({ params: Promise.resolve({ token }) });
  const send = (token: string, name: string, body: string, headers: Record<string, string> = {}) => {
    const form = new FormData();
    form.set("file", new File([body], name, { type: "text/plain" }));
    return new Request(`http://x/api/upload-request/${token}`, {
      method: "POST",
      body: form,
      headers: { "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}`, ...headers },
    });
  };
  let POST: typeof import("@/app/api/upload-request/[token]/route").POST;
  beforeEach(async () => {
    vi.resetModules();
    ({ POST } = await import("@/app/api/upload-request/[token]/route"));
  });

  it("anonim yükleme: dosya klasöre, oluşturanın adına yazılır; kontenjan ve bildirim güncellenir; ad çakışmasında üzerine yazılmaz", async () => {
    const { owner, folder, token, req } = await setup();
    const r1 = await POST(send(token, "rapor.txt", "ilk"), ctx(token));
    expect(r1.status).toBe(200);
    const r2 = await POST(send(token, "rapor.txt", "ikinci"), ctx(token));
    expect((await r2.json()).name).toBe("rapor (2).txt");

    const files = await prisma.file.findMany({ where: { folderId: folder.id }, orderBy: { name: "asc" } });
    expect(files.map((f) => f.name)).toEqual(["rapor (2).txt", "rapor.txt"]);
    expect(files.every((f) => f.ownerId === owner.id)).toBe(true);
    expect((await prisma.uploadRequest.findUniqueOrThrow({ where: { id: req.id } })).uploadCount).toBe(2);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).usedBytes).toBe(BigInt("ilk".length + "ikinci".length));
    expect(await prisma.notification.count({ where: { userId: owner.id, type: "UPLOAD_RECEIVED" } })).toBe(2);
  });

  it("kontenjan: 10 EŞZAMANLI yüklemeden en fazla maxFiles kadarı kabul edilir", async () => {
    const { folder, token, req } = await setup({ maxFiles: 3 });
    const res = await Promise.all(Array.from({ length: 10 }, (_, i) => POST(send(token, `d${i}.txt`, "x"), ctx(token))));
    const ok = res.filter((r) => r.status === 200).length;
    expect(ok).toBe(3);
    expect(res.filter((r) => r.status === 410)).toHaveLength(7);
    expect(await prisma.file.count({ where: { folderId: folder.id } })).toBe(3);
    expect((await prisma.uploadRequest.findUniqueOrThrow({ where: { id: req.id } })).uploadCount).toBe(3);
  });

  it("başarısız yükleme kontenjanı harcamaz (boyut aşımı → 413, sayaç geri döner)", async () => {
    const { token, req } = await setup({ maxFileBytes: 10n });
    const res = await POST(send(token, "buyuk.txt", "x".repeat(500)), ctx(token));
    expect(res.status).toBe(413);
    expect((await prisma.uploadRequest.findUniqueOrThrow({ where: { id: req.id } })).uploadCount).toBe(0);
  });

  it("süresi dolmuş / iptal edilmiş istek dosya kabul etmez", async () => {
    const expired = await setup({ expiresAt: new Date(Date.now() - 1000) });
    expect((await POST(send(expired.token, "a.txt", "x"), ctx(expired.token))).status).toBe(410);
    const live = await setup();
    await prisma.uploadRequest.update({ where: { id: live.req.id }, data: { revoked: true } });
    expect((await POST(send(live.token, "a.txt", "x"), ctx(live.token))).status).toBe(404);
  });

  it("şifreli istek: şifresiz 401 (kontenjan harcanmaz), doğru şifreyle 200", async () => {
    const { token, req } = await setup({ password: "gizli-parola" });
    expect((await POST(send(token, "a.txt", "x"), ctx(token))).status).toBe(401);
    expect((await POST(send(token, "a.txt", "x", { "x-upload-password": "yanlis" }), ctx(token))).status).toBe(401);
    expect((await prisma.uploadRequest.findUniqueOrThrow({ where: { id: req.id } })).uploadCount).toBe(0);
    expect((await POST(send(token, "a.txt", "x", { "x-upload-password": "gizli-parola" }), ctx(token))).status).toBe(200);
  });

  it("silinmiş klasöre yükleme reddedilir ve diskte/kontenjanda iz bırakmaz", async () => {
    const { folder, token, req } = await setup();
    await prisma.folder.update({ where: { id: folder.id }, data: { deletedAt: new Date() } });
    expect((await POST(send(token, "a.txt", "x"), ctx(token))).status).toBe(410);
    expect((await prisma.uploadRequest.findUniqueOrThrow({ where: { id: req.id } })).uploadCount).toBe(0);
    expect(await prisma.file.count({ where: { folderId: folder.id } })).toBe(0);
  });
});
