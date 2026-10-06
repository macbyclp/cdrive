import { describe, it, expect, afterEach } from "vitest";
import { sealSecret, openSecret, isSealed, encryptionEnabled } from "@/lib/secret-box";

const KEY = "k".repeat(40);
const OLD = process.env.DATA_ENCRYPTION_KEY;
afterEach(() => {
  if (OLD === undefined) delete process.env.DATA_ENCRYPTION_KEY;
  else process.env.DATA_ENCRYPTION_KEY = OLD;
});

describe("secret-box", () => {
  it("anahtar yokken düz metin olarak kalır (geri uyum)", () => {
    delete process.env.DATA_ENCRYPTION_KEY;
    expect(encryptionEnabled()).toBe(false);
    expect(sealSecret("JBSWY3DP")).toBe("JBSWY3DP");
    expect(openSecret("JBSWY3DP")).toBe("JBSWY3DP");
  });

  it("anahtar varken şifreler ve geri çözer; her seferinde farklı çıktı verir", () => {
    process.env.DATA_ENCRYPTION_KEY = KEY;
    const a = sealSecret("JBSWY3DP");
    const b = sealSecret("JBSWY3DP");
    expect(isSealed(a)).toBe(true);
    expect(a).not.toContain("JBSWY3DP");
    expect(a).not.toBe(b);
    expect(openSecret(a)).toBe("JBSWY3DP");
  });

  it("eski düz metin kayıtlar anahtar açıkken de okunur", () => {
    process.env.DATA_ENCRYPTION_KEY = KEY;
    expect(openSecret("ESKI-DUZ-METIN")).toBe("ESKI-DUZ-METIN");
  });

  it("zaten şifreli değeri iki kez şifrelemez", () => {
    process.env.DATA_ENCRYPTION_KEY = KEY;
    const a = sealSecret("x");
    expect(sealSecret(a)).toBe(a);
  });

  it("yanlış anahtar veya anahtarsız okuma hata fırlatır (sessizce bozuk veri dönmez)", () => {
    process.env.DATA_ENCRYPTION_KEY = KEY;
    const a = sealSecret("gizli");
    process.env.DATA_ENCRYPTION_KEY = "z".repeat(40);
    expect(() => openSecret(a)).toThrow();
    delete process.env.DATA_ENCRYPTION_KEY;
    expect(() => openSecret(a)).toThrow(/DATA_ENCRYPTION_KEY/);
  });

  it("kurcalanmış şifreli metni reddeder (GCM kimlik doğrulaması)", () => {
    process.env.DATA_ENCRYPTION_KEY = KEY;
    const a = sealSecret("gizli");
    const parts = a.split(":");
    parts[4] = Buffer.from("tampered").toString("base64");
    expect(() => openSecret(parts.join(":"))).toThrow();
  });

  it("çok kısa anahtarı reddeder", () => {
    process.env.DATA_ENCRYPTION_KEY = "kisa";
    expect(() => sealSecret("x")).toThrow(/32/);
  });
});
