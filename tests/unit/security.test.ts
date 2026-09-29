import { describe, expect, it } from "vitest";
import { imageDimensions, isInlineSafeMime, isPlaceholderSecret, isTrustedOnlyOfficeUrl, readBodyLimited } from "@/lib/security";
import { resolveSecret } from "@/lib/session-secret";
import { makeShareProof, verifyShareProof } from "@/lib/share";

describe("isInlineSafeMime", () => {
  it("görsel/PDF/medya/düz metin güvenli; HTML, SVG, XML, JS değil", () => {
    for (const ok of ["image/png", "image/jpeg", "application/pdf", "text/plain; charset=utf-8", "video/mp4", "audio/mpeg"]) {
      expect(isInlineSafeMime(ok)).toBe(true);
    }
    for (const bad of ["text/html", "image/svg+xml", "application/xhtml+xml", "text/xml", "application/javascript", "application/octet-stream", "", null, undefined]) {
      expect(isInlineSafeMime(bad)).toBe(false);
    }
  });
});

describe("imageDimensions", () => {
  it("PNG başlığından boyutu okur", () => {
    const png = Buffer.alloc(33);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png);
    png.writeUInt32BE(13, 8);
    png.write("IHDR", 12);
    png.writeUInt32BE(50000, 16);
    png.writeUInt32BE(40000, 20);
    expect(imageDimensions(png)).toEqual({ width: 50000, height: 40000 });
  });

  it("JPEG SOF işaretinden boyutu okur", () => {
    const jpg = Buffer.from([
      0xff, 0xd8, // SOI
      0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, // APP0 (uzunluk 4)
      0xff, 0xc0, 0x00, 0x0b, 0x08, 0x03, 0xe8, 0x07, 0xd0, 0x03, 0x01, 0x11, 0x00, // SOF0: 1000x2000
    ]);
    expect(imageDimensions(jpg)).toEqual({ width: 2000, height: 1000 });
  });

  it("tanınmayan veriyi null yapar", () => {
    expect(imageDimensions(Buffer.from("not an image at all, just text"))).toBeNull();
  });
});

describe("isPlaceholderSecret / resolveSecret", () => {
  it("şablon örnek değerleri yakalanır, rastgele değerler geçer", () => {
    expect(isPlaceholderSecret("replace-with-a-long-random-string")).toBe(true);
    expect(isPlaceholderSecret("replace-with-openssl-rand-hex-32")).toBe(true);
    expect(isPlaceholderSecret("insecure-dev-secret-change-me")).toBe(true);
    expect(isPlaceholderSecret("9f2c41d07a3b4e5f8a6b7c8d9e0f1a2b3c4d5e6f")).toBe(false);
    expect(isPlaceholderSecret(undefined)).toBe(false);
  });

  it("üretimde örnek SESSION_SECRET ile başlamayı reddeder", () => {
    const env = process.env as Record<string, string | undefined>;
    const prev = env.NODE_ENV;
    env.NODE_ENV = "production";
    try {
      expect(() => resolveSecret("replace-with-a-long-random-string")).toThrow(/örnek değer/);
      expect(() => resolveSecret("short")).toThrow();
      expect(resolveSecret("9f2c41d07a3b4e5f8a6b7c8d9e0f1a2b3c4d5e6f")).toContain("9f2c");
    } finally {
      env.NODE_ENV = prev;
    }
  });
});

describe("isTrustedOnlyOfficeUrl", () => {
  const env = { ONLYOFFICE_URL: "https://office.example.test/" } as unknown as NodeJS.ProcessEnv;
  it("yalnızca yapılandırılmış Document Server origin'ine izin verir", () => {
    expect(isTrustedOnlyOfficeUrl("https://office.example.test/cache/files/a.docx", env)).toBe(true);
    for (const bad of [
      "http://office.example.test/x", // farklı protokol = farklı origin
      "https://office.example.test.evil.test/x",
      "https://evil.test/x",
      "http://127.0.0.1:8080/",
      "http://169.254.169.254/",
      "file:///etc/passwd",
      "javascript:alert(1)",
      "not a url",
    ]) {
      expect(isTrustedOnlyOfficeUrl(bad, env)).toBe(false);
    }
  });
  it("ek origin'ler ONLYOFFICE_ALLOWED_ORIGINS ile verilebilir; yapılandırma yoksa hiçbir şeye izin verilmez", () => {
    const extra = { ...env, ONLYOFFICE_ALLOWED_ORIGINS: "http://onlyoffice:80, https://x.test" } as NodeJS.ProcessEnv;
    expect(isTrustedOnlyOfficeUrl("http://onlyoffice/cache/a", extra)).toBe(true);
    expect(isTrustedOnlyOfficeUrl("https://x.test/a", extra)).toBe(true);
    expect(isTrustedOnlyOfficeUrl("https://office.example.test/a", {} as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe("readBodyLimited", () => {
  it("sınır içindeyse okur, aşarsa (bildirilen veya fiili boyut) hata fırlatır", async () => {
    expect((await readBodyLimited(new Response("merhaba"), 100)).toString()).toBe("merhaba");
    await expect(readBodyLimited(new Response("x".repeat(500)), 100)).rejects.toThrow(/büyük/);
    await expect(
      readBodyLimited(new Response("x", { headers: { "content-length": "999999" } }), 100)
    ).rejects.toThrow(/büyük/);
  });
});

describe("paylaşım devam kanıtı", () => {
  it("imza, bağlantıya ve süreye bağlıdır", () => {
    const now = Date.now();
    const proof = makeShareProof("link-1", now);
    expect(verifyShareProof("link-1", proof, now + 1000)).toBe(true);
    expect(verifyShareProof("link-2", proof, now + 1000)).toBe(false); // başka bağlantı
    expect(verifyShareProof("link-1", proof, now + 2 * 3600 * 1000)).toBe(false); // süresi doldu
    expect(verifyShareProof("link-1", "9999999999.deadbeef", now)).toBe(false);
    expect(verifyShareProof("link-1", null, now)).toBe(false);
  });
});
