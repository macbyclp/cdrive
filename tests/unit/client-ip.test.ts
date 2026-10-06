import { describe, it, expect } from "vitest";
import { clientIp } from "@/lib/api-helpers";

const req = (xff?: string) => new Request("http://x/", { headers: xff ? { "x-forwarded-for": xff } : {} });
const env = (hops?: string) => ({ TRUSTED_PROXY_HOPS: hops }) as unknown as NodeJS.ProcessEnv;

describe("clientIp", () => {
  it("varsayılan 1 vekil: tek değeri döner (Caddy gibi başlığı ezen vekil)", () => {
    expect(clientIp(req("203.0.113.9"), env())).toBe("203.0.113.9");
  });

  it("nginx gibi ekleyen vekil: istemcinin sahte soldaki değeri yok sayılır, SAĞDAKİ kullanılır", () => {
    expect(clientIp(req("1.2.3.4, 203.0.113.9"), env())).toBe("203.0.113.9");
    expect(clientIp(req("9.9.9.9, 1.2.3.4, 203.0.113.9"), env("1"))).toBe("203.0.113.9");
  });

  it("iki güvenilir vekil (ör. Cloudflare + Caddy): sağdan ikinci", () => {
    expect(clientIp(req("1.2.3.4, 203.0.113.9, 172.70.0.1"), env("2"))).toBe("203.0.113.9");
  });

  it("liste beklenenden kısaysa en soldaki değere düşer", () => {
    expect(clientIp(req("203.0.113.9"), env("3"))).toBe("203.0.113.9");
  });

  it("0 vekil: başlık tamamen yok sayılır", () => {
    expect(clientIp(req("1.2.3.4"), env("0"))).toBeNull();
  });

  it("başlık yoksa veya geçersiz yapılandırmada güvenli davranır", () => {
    expect(clientIp(req(), env())).toBeNull();
    expect(clientIp(req("203.0.113.9"), env("abc"))).toBe("203.0.113.9");
    expect(clientIp(req("203.0.113.9"), env("-1"))).toBe("203.0.113.9");
  });
});
