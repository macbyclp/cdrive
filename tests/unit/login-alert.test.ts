import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({ findMany: vi.fn(), sendMail: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { session: { findMany: m.findMany } } }));
vi.mock("@/lib/mailer", () => ({ sendMail: m.sendMail, appBaseUrl: () => "https://cdrive.test" }));
vi.mock("@/lib/org", () => ({ getOrgName: async () => "Acme" }));

import { deviceLabel, notifyNewDeviceLogin } from "@/lib/login-alert";

const CHROME_WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const CHROME_WIN_NEWER = CHROME_WIN.replace("130.0", "133.0");
const SAFARI_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const FIREFOX_LINUX = "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0";
const EDGE = CHROME_WIN + " Edg/130.0.0.0";

const user = { id: "u1", name: "Ayşe", email: "a@x.y" };
const meta = (userAgent: string | null) => ({ ip: "203.0.113.9", userAgent });

beforeEach(() => vi.clearAllMocks());

describe("deviceLabel", () => {
  it("tarayıcı ve işletim sistemini çıkarır", () => {
    expect(deviceLabel(CHROME_WIN)).toBe("Chrome · Windows");
    expect(deviceLabel(SAFARI_IOS)).toBe("Safari · iOS");
    expect(deviceLabel(FIREFOX_LINUX)).toBe("Firefox · Linux");
    expect(deviceLabel(EDGE)).toBe("Edge · Windows");
  });
  it("sürüm değişince etiket aynı kalır (tarayıcı güncellemesi uyarı üretmesin)", () => {
    expect(deviceLabel(CHROME_WIN)).toBe(deviceLabel(CHROME_WIN_NEWER));
  });
  it("boş/bilinmeyen UA için güvenli etiket", () => {
    expect(deviceLabel(null)).toBe("Bilinmeyen cihaz");
    expect(deviceLabel("")).toBe("Bilinmeyen cihaz");
  });
});

describe("notifyNewDeviceLogin", () => {
  it("hesabın İLK girişinde uyarı göndermez", async () => {
    m.findMany.mockResolvedValue([]);
    expect(await notifyNewDeviceLogin(user, "s2", meta(CHROME_WIN))).toBe(false);
    expect(m.sendMail).not.toHaveBeenCalled();
  });

  it("bilinen cihazdan (sürüm farkı olsa da) girişte göndermez", async () => {
    m.findMany.mockResolvedValue([{ userAgent: CHROME_WIN }]);
    expect(await notifyNewDeviceLogin(user, "s2", meta(CHROME_WIN_NEWER))).toBe(false);
    expect(m.sendMail).not.toHaveBeenCalled();
  });

  it("yeni cihazdan girişte cihaz, IP ve hesap bağlantısıyla e-posta gönderir", async () => {
    m.findMany.mockResolvedValue([{ userAgent: CHROME_WIN }]);
    expect(await notifyNewDeviceLogin(user, "s2", meta(SAFARI_IOS))).toBe(true);
    const mail = m.sendMail.mock.calls[0][0];
    expect(mail.to).toBe("a@x.y");
    expect(mail.text).toContain("Safari · iOS");
    expect(mail.text).toContain("203.0.113.9");
    expect(mail.text).toContain("https://cdrive.test/account");
    expect(mail.subject).toMatch(/Yeni cihaz/);
  });

  it("yeni oturumun kendisini geçmişten hariç tutar", async () => {
    m.findMany.mockResolvedValue([{ userAgent: CHROME_WIN }]);
    await notifyNewDeviceLogin(user, "s2", meta(SAFARI_IOS));
    expect(m.findMany.mock.calls[0][0].where).toEqual({ userId: "u1", id: { not: "s2" } });
  });

  it("hata fırlatmaz (e-posta/DB arızası girişi bozmaz)", async () => {
    m.findMany.mockRejectedValue(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await notifyNewDeviceLogin(user, "s2", meta(CHROME_WIN))).toBe(false);
    spy.mockRestore();
  });

  it("e-posta gövdesinde HTML enjeksiyonu kaçışlanır", async () => {
    m.findMany.mockResolvedValue([{ userAgent: CHROME_WIN }]);
    await notifyNewDeviceLogin({ ...user, name: "<script>x</script>" }, "s2", meta(SAFARI_IOS));
    const mail = m.sendMail.mock.calls[0][0];
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
  });
});
