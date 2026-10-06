import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";
import { passwordProblem, assertPasswordPolicy } from "@/lib/password-policy";
import { bcryptRounds, hashPassword, passwordNeedsRehash } from "@/lib/auth";

describe("passwordProblem", () => {
  it("makul bir parolayı kabul eder (karmaşıklık kuralı dayatmaz)", () => {
    expect(passwordProblem("mavi-bulut-kahve-42")).toBeNull();
    expect(passwordProblem("uzunbirparolacümlesi")).toBeNull();
  });
  it("8 karakterden kısayı reddeder", () => {
    expect(passwordProblem("kisa1")).toMatch(/en az 8/);
  });
  it("72 baytı aşanı reddeder (bcrypt fazlasını sessizce yok sayar); bayt sayımı çok baytlı harfleri hesaba katar", () => {
    expect(passwordProblem("ab".repeat(36) + "c")).toMatch(/72/);
    expect(passwordProblem("ab".repeat(36))).toBeNull();
    expect(passwordProblem("şç".repeat(19))).toMatch(/72/); // 37 × 2 bayt = 74
  });
  it("yaygın parolaları (büyük/küçük harf fark etmeden) reddeder", () => {
    for (const p of ["password", "Password1", "12345678", "QWERTY123", "Galatasaray"]) expect(passwordProblem(p)).toMatch(/yaygın/);
  });
  it("tek karakter tekrarını reddeder", () => {
    expect(passwordProblem("zzzzzzzzzz")).toMatch(/tekrar/);
  });
  it("e-posta veya adla aynı parolayı reddeder", () => {
    expect(passwordProblem("ayse.yilmaz@firma.com", { email: "ayse.yilmaz@firma.com" })).toMatch(/e-posta/);
    expect(passwordProblem("ayse.yilmaz", { email: "ayse.yilmaz@firma.com" })).toMatch(/e-posta/);
    expect(passwordProblem("ayşeyılmaz", { name: "Ayşe Yılmaz" })).toMatch(/adınızla/);
  });
  it("assertPasswordPolicy 400 durumlu hata fırlatır", () => {
    try {
      assertPasswordPolicy("password");
      expect.unreachable();
    } catch (e) {
      expect((e as { status: number }).status).toBe(400);
    }
  });
});

describe("bcrypt maliyeti ve yeniden hash", () => {
  it("varsayılan 12; BCRYPT_ROUNDS yalnız 10–14 arasındaysa kabul edilir", () => {
    const env = (v?: string) => ({ BCRYPT_ROUNDS: v }) as unknown as NodeJS.ProcessEnv;
    expect(bcryptRounds(env())).toBe(12);
    expect(bcryptRounds(env("10"))).toBe(10);
    expect(bcryptRounds(env("14"))).toBe(14);
    for (const bad of ["4", "31", "abc", "11.5"]) expect(bcryptRounds(env(bad))).toBe(12);
  });
  it("eski (10 tur) hash yeniden hash gerektirir, güncel olan gerektirmez; bozuk hash'te hata vermez", async () => {
    const old = await bcrypt.hash("x", 10);
    expect(passwordNeedsRehash(old, 12)).toBe(true);
    expect(passwordNeedsRehash(old, 10)).toBe(false);
    expect(passwordNeedsRehash("bozuk", 12)).toBe(false);
  });
  it("hashPassword verilen turla üretir ve eski hash'ler hâlâ doğrulanır", async () => {
    const h = await hashPassword("parola", 10);
    expect(bcrypt.getRounds(h)).toBe(10);
    expect(await bcrypt.compare("parola", h)).toBe(true);
  });
});
