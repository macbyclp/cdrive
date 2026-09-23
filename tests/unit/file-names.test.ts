import { describe, it, expect } from "vitest";
import { copyNameFor, firstFreeName } from "@/lib/file-names";

describe("copyNameFor", () => {
  it("uzantıdan önce (kopya) ekler", () => {
    expect(copyNameFor("rapor.pdf")).toBe("rapor (kopya).pdf");
    expect(copyNameFor("arşiv.tar.gz")).toBe("arşiv.tar (kopya).gz");
  });
  it("uzantısız ve nokta ile başlayan adlarda sona ekler", () => {
    expect(copyNameFor("README")).toBe("README (kopya)");
    expect(copyNameFor(".env")).toBe(".env (kopya)");
  });
});

describe("firstFreeName", () => {
  it("ad boştaysa olduğu gibi döner", async () => {
    expect(await firstFreeName("a.txt", async () => false)).toBe("a.txt");
  });
  it("dolu adlar için (2), (3) ... dener", async () => {
    const taken = new Set(["a.txt", "a (2).txt"]);
    expect(await firstFreeName("a.txt", async (n) => taken.has(n))).toBe("a (3).txt");
  });
});
