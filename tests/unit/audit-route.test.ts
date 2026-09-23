import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({ findMany: vi.fn(), requireRole: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: { auditLog: { findMany: m.findMany } } }));
vi.mock("@/lib/auth", () => ({ requireRole: m.requireRole, AuthError: class extends Error {} }));

const req = (qs = "") => new Request(`http://x/api/admin/audit${qs}`);
const whereOf = () => m.findMany.mock.calls[0][0].where;

beforeEach(() => {
  vi.clearAllMocks();
  m.findMany.mockResolvedValue([]);
});

describe("denetim kaydı kapsamı", () => {
  it("ADMIN tüm kurumun kayıtlarını görür", async () => {
    const { GET } = await import("@/app/api/admin/audit/route");
    m.requireRole.mockResolvedValue({ id: "a", role: "ADMIN", departmentId: null });
    expect((await GET(req())).status).toBe(200);
    expect(whereOf().user).toBeUndefined();
  });

  it("MANAGER yalnız kendi departmanının kayıtlarını görür", async () => {
    const { GET } = await import("@/app/api/admin/audit/route");
    m.requireRole.mockResolvedValue({ id: "m", role: "MANAGER", departmentId: "d1" });
    await GET(req("?userId=baskasi"));
    expect(whereOf().user).toEqual({ departmentId: "d1" });
    expect(whereOf().userId).toBe("baskasi");
  });

  it("departmanı olmayan MANAGER yalnız kendi kayıtlarını görür", async () => {
    const { GET } = await import("@/app/api/admin/audit/route");
    m.requireRole.mockResolvedValue({ id: "m", role: "MANAGER", departmentId: null });
    await GET(req());
    expect(whereOf().user).toEqual({ id: "m" });
  });

  it("geçersiz eylem filtresi 400", async () => {
    const { GET } = await import("@/app/api/admin/audit/route");
    m.requireRole.mockResolvedValue({ id: "a", role: "ADMIN", departmentId: null });
    expect((await GET(req("?action=YOK_BOYLE"))).status).toBe(400);
    expect(m.findMany).not.toHaveBeenCalled();
  });

  it("CSV dışa aktarımı ek olarak iner ve kapsamı korur", async () => {
    const { GET } = await import("@/app/api/admin/audit/route");
    m.requireRole.mockResolvedValue({ id: "m", role: "MANAGER", departmentId: "d1" });
    m.findMany.mockResolvedValue([
      { createdAt: new Date("2026-01-01T00:00:00Z"), action: "UPLOAD", user: { name: "Ayşe", email: "a@x" }, targetType: "file", targetId: "f1", detail: "=kötü.xlsx", ip: "1.2.3.4" },
    ]);
    const res = await GET(req("?format=csv"));
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain("attachment");
    expect(whereOf().user).toEqual({ departmentId: "d1" });
    const text = await res.text();
    expect(text).toContain("'=kötü.xlsx");
  });
});
