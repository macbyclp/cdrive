import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({ rcUpdateMany: vi.fn(), userUpdateMany: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { twoFactorRecoveryCode: { updateMany: m.rcUpdateMany }, user: { updateMany: m.userUpdateMany } },
}));

import {
  generateRecoveryCode,
  normalizeRecoveryCode,
  looksLikeRecoveryCode,
  hashRecoveryCode,
  consumeRecoveryCode,
} from "@/lib/recovery-codes";
import { verifySecondFactor } from "@/lib/two-factor";
import { generateTotpSecret } from "@/lib/totp";
import { createHmac } from "crypto";

beforeEach(() => vi.clearAllMocks());

describe("kurtarma kodu biçimi", () => {
  it("xxxxx-xxxxx biçiminde, karışan karakter içermeden üretir", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateRecoveryCode()).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]{5}-[abcdefghjkmnpqrstuvwxyz23456789]{5}$/);
    }
  });
  it("büyük harf, boşluk ve tire farkını yok sayar (aynı hash)", () => {
    expect(normalizeRecoveryCode("ABCDE fghjk")).toBe("abcdefghjk");
    expect(hashRecoveryCode("abcde-fghjk")).toBe(hashRecoveryCode("ABCDE FGHJK"));
  });
  it("6 haneli TOTP kodunu kurtarma kodu sanmaz", () => {
    expect(looksLikeRecoveryCode("123456")).toBe(false);
    expect(looksLikeRecoveryCode("abcde-fghjk")).toBe(true);
    expect(looksLikeRecoveryCode("1234567890")).toBe(false); // harf yok
  });
});

describe("consumeRecoveryCode", () => {
  it("yalnız tam olarak 1 satır güncellenirse true", async () => {
    m.rcUpdateMany.mockResolvedValueOnce({ count: 1 });
    expect(await consumeRecoveryCode("u1", "abcde-fghjk")).toBe(true);
    expect(m.rcUpdateMany.mock.calls[0][0].where).toMatchObject({ userId: "u1", usedAt: null, codeHash: hashRecoveryCode("abcde-fghjk") });
  });
  it("kullanılmış/yanlış kodda false; bozuk girdide DB'ye gitmez", async () => {
    m.rcUpdateMany.mockResolvedValueOnce({ count: 0 });
    expect(await consumeRecoveryCode("u1", "abcde-fghjk")).toBe(false);
    expect(await consumeRecoveryCode("u1", "123456")).toBe(false);
    expect(m.rcUpdateMany).toHaveBeenCalledTimes(1);
  });
});

function totp(secret: string, t = Date.now() / 1000) {
  const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, val = 0; const bytes: number[] = [];
  for (const ch of secret) { val = (val << 5) | alpha.indexOf(ch); bits += 5; if (bits >= 8) { bytes.push((val >>> (bits - 8)) & 0xff); bits -= 8; } }
  const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(Math.floor(t / 30)));
  const h = createHmac("sha1", Buffer.from(bytes)).update(buf).digest();
  const o = h[h.length - 1] & 0xf;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, "0");
}

describe("verifySecondFactor", () => {
  const secret = generateTotpSecret();
  const user = { id: "u1", twoFactorSecret: secret };

  it("geçerli TOTP kabul edilir", async () => {
    m.userUpdateMany.mockResolvedValueOnce({ count: 1 });
    expect(await verifySecondFactor(user, totp(secret))).toEqual({ ok: true, method: "totp" });
  });
  it("aynı TOTP ikinci kez 'replay' olarak reddedilir", async () => {
    m.userUpdateMany.mockResolvedValueOnce({ count: 0 });
    expect(await verifySecondFactor(user, totp(secret))).toEqual({ ok: false, reason: "replay" });
  });
  it("yanlış kod DB'ye dokunmadan reddedilir", async () => {
    expect(await verifySecondFactor(user, "000000")).toMatchObject({ ok: false });
    expect(m.userUpdateMany).not.toHaveBeenCalled();
  });
  it("kurtarma kodu method=recovery döner", async () => {
    m.rcUpdateMany.mockResolvedValueOnce({ count: 1 });
    expect(await verifySecondFactor(user, "abcde-fghjk")).toEqual({ ok: true, method: "recovery" });
  });
});
