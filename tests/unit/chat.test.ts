import { describe, it, expect } from "vitest";
import { channelScopeKey, dmScopeKey, chatPreview } from "@/lib/chat";

/**
 * Sohbet yardımcıları. scopeKey'ler okunmamış-mesaj sayacının (ChatReadState) anahtarı;
 * kanal ve DM anahtarlarının BİRBİRİNE KARIŞMAMASI önemli — karışırsa bir kanalı okumak
 * bir DM'i de okunmuş sayar (ya da tersi).
 */

describe("scopeKey üretimi", () => {
  it("kanal ve DM anahtarları farklı önek kullanır", () => {
    expect(channelScopeKey("abc")).toBe("channel:abc");
    expect(dmScopeKey("abc")).toBe("dm:abc");
  });

  it("aynı id için kanal ve DM anahtarı ASLA çakışmaz", () => {
    // Kanal id'si ile kullanıcı id'si teoride aynı string olabilir (ikisi de cuid);
    // önek olmasa aynı satıra yazarlardı.
    const sameId = "cmsvmqj5a0000107bvcd7ycwk";
    expect(channelScopeKey(sameId)).not.toBe(dmScopeKey(sameId));
  });

  it("farklı id'ler farklı anahtar üretir", () => {
    expect(dmScopeKey("kullanici-1")).not.toBe(dmScopeKey("kullanici-2"));
  });
});

describe("chatPreview", () => {
  it("kısa içeriği olduğu gibi bırakır", () => {
    expect(chatPreview("merhaba")).toBe("merhaba");
  });

  it("baştaki/sondaki boşlukları kırpar", () => {
    expect(chatPreview("   merhaba   ")).toBe("merhaba");
  });

  it("uzun içeriği kısaltıp üç nokta ekler", () => {
    const uzun = "a".repeat(100);
    const sonuc = chatPreview(uzun);
    expect(sonuc).toHaveLength(81); // 80 karakter + "…"
    expect(sonuc.endsWith("…")).toBe(true);
  });

  it("tam sınırdaki içeriği kısaltmaz", () => {
    const tam = "b".repeat(80);
    expect(chatPreview(tam)).toBe(tam);
    expect(chatPreview(tam).endsWith("…")).toBe(false);
  });

  it("özel max değerine uyar", () => {
    expect(chatPreview("merhaba dünya", 7)).toBe("merhaba…");
  });

  it("sadece boşluktan oluşan içerikte boş string döner", () => {
    expect(chatPreview("    ")).toBe("");
  });
});
