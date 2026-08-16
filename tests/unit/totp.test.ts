import { describe, it, expect } from "vitest";
import { generateTotpSecret, verifyTotpToken } from "@/lib/totp";
import { createHmac } from "crypto";

// RFC 6238 algoritmasını testte bağımsız olarak yeniden uygular — src/lib/totp.ts
// ile aynı koda güvenmek yerine, gerçekten standarda uygun kod üretip
// doğrulanabildiğini kanıtlar.
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}
function computeCode(secret: string, epochSeconds: number): string {
  const counter = Math.floor(epochSeconds / 30);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", base32Decode(secret)).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

describe("TOTP", () => {
  it("generates a base32 secret of reasonable length", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(secret.length).toBeGreaterThanOrEqual(16);
  });

  it("generates a different secret each time", () => {
    expect(generateTotpSecret()).not.toBe(generateTotpSecret());
  });

  it("accepts the correct current code", () => {
    const secret = generateTotpSecret();
    const code = computeCode(secret, Date.now() / 1000);
    expect(verifyTotpToken(code, secret)).toBe(true);
  });

  it("rejects a wrong code", () => {
    const secret = generateTotpSecret();
    const realCode = computeCode(secret, Date.now() / 1000);
    const wrongCode = String((Number(realCode) + 1) % 1_000_000).padStart(6, "0");
    expect(verifyTotpToken(wrongCode, secret)).toBe(false);
  });

  it("rejects a code generated with a different secret", () => {
    const secretA = generateTotpSecret();
    const secretB = generateTotpSecret();
    const codeForB = computeCode(secretB, Date.now() / 1000);
    expect(verifyTotpToken(codeForB, secretA)).toBe(false);
  });

  it("rejects malformed input instead of throwing", () => {
    const secret = generateTotpSecret();
    expect(verifyTotpToken("abc", secret)).toBe(false);
    expect(verifyTotpToken("", secret)).toBe(false);
  });

  it("tolerates one period of clock drift in the past", () => {
    const secret = generateTotpSecret();
    const oneStepAgo = Date.now() / 1000 - 30;
    const code = computeCode(secret, oneStepAgo);
    expect(verifyTotpToken(code, secret)).toBe(true);
  });
});
