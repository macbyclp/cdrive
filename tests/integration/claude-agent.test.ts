import { describe, it, expect, afterEach, afterAll, vi, beforeEach } from "vitest";
import { rmSync } from "fs";
import { prisma } from "@/lib/prisma";
import { createFileFromBuffer } from "@/lib/file-versions";
import { runAgent, type AgentEvent } from "@/lib/claude-agent";
import { createTestUser, cleanupTestData } from "../helpers/db";

// Kullanıcının kendi API anahtarıyla çalışan ajan: anahtar şifreli saklanır, araçlar kullanıcının yetkisiyle işler,
// Anthropic hataları anlaşılır mesaja çevrilir. Anthropic çağrıları sahte fetch ile taklit edilir (ağ yok).
vi.hoisted(() => {
  process.env.STORAGE_ROOT = "./.test-storage-claude-agent";
});

afterAll(() => rmSync("./.test-storage-claude-agent", { recursive: true, force: true }));

let userIds: string[] = [];
beforeEach(() => {
  process.env.SESSION_SECRET = "test-secret-test-secret-test-secret-123";
});
afterEach(async () => {
  await prisma.claudeProposal.deleteMany({ where: { userId: { in: userIds } } });
  await cleanupTestData({ userIds });
  userIds = [];
});

async function user() {
  const u = await createTestUser({ role: "MEMBER" });
  userIds.push(u.id);
  return prisma.user.findUniqueOrThrow({ where: { id: u.id } });
}

const KEY = "sk-ant-api03-TESTKEYTESTKEYTESTKEY1234";

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function collect(opts: Parameters<typeof runAgent>[0]) {
  const events: AgentEvent[] = [];
  await runAgent({ ...opts, emit: (e) => events.push(e) });
  return events;
}

describe("ajan döngüsü", () => {
  it("ara → oku → öner: olaylar sırayla gelir, öneri kaydolur, dosya DEĞİŞMEZ; anahtar yalnızca x-api-key başlığında gider", async () => {
    const u = await user();
    const f = await createFileFromBuffer({ name: `not-${u.id.slice(-6)}.txt`, mimeType: "text/plain", folderId: null, ownerId: u.id, buffer: Buffer.from("eski metin") });

    let call = 0;
    const seen: { headers: Record<string, string>; body: string }[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      seen.push({ headers: init.headers as Record<string, string>, body: String(init.body) });
      call++;
      if (call === 1) return reply({ stop_reason: "tool_use", content: [{ type: "text", text: "Bakıyorum." }, { type: "tool_use", id: "t1", name: "read_file", input: { fileId: f.id } }] });
      if (call === 2) return reply({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "t2", name: "propose_edit", input: { fileId: f.id, content: "yeni metin", summary: "güncelle" } }] });
      return reply({ stop_reason: "end_turn", content: [{ type: "text", text: "Öneri hazır." }] });
    }) as typeof fetch;

    const events = await collect({ user: u, apiKey: KEY, message: "notu güncelle", emit: () => {}, fetchImpl });
    expect(events.map((e) => e.type)).toEqual(["text", "tool", "tool", "proposal", "text"]);
    expect(seen[0].headers["x-api-key"]).toBe(KEY);
    expect(seen.every((s) => !s.body.includes(KEY))).toBe(true);

    const proposals = await prisma.claudeProposal.findMany({ where: { userId: u.id } });
    expect(proposals).toHaveLength(1);
    expect(proposals[0].status).toBe("PENDING");
    const fresh = await prisma.file.findUniqueOrThrow({ where: { id: f.id }, include: { versions: true } });
    expect(fresh.versions).toHaveLength(1); // onay olmadan yeni sürüm yok
  });

  it("başkasının dosyasını okutmaya çalışınca araç hata döner, içerik Claude'a sızmaz", async () => {
    const owner = await user();
    const other = await user();
    const secret = await createFileFromBuffer({ name: `gizli-${owner.id.slice(-6)}.txt`, mimeType: "text/plain", folderId: null, ownerId: owner.id, buffer: Buffer.from("SIR-ICERIK") });

    const bodies: string[] = [];
    let call = 0;
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      bodies.push(String(init.body));
      call++;
      if (call === 1) return reply({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "read_file", input: { fileId: secret.id } }] });
      return reply({ stop_reason: "end_turn", content: [{ type: "text", text: "Erişemedim." }] });
    }) as typeof fetch;

    await collect({ user: other, apiKey: KEY, message: "oku", emit: () => {}, fetchImpl });
    expect(bodies.join("\n")).not.toContain("SIR-ICERIK");
    expect(bodies[1]).toContain("erişim yok");
  });

  it("Anthropic 401/429/500 → anlaşılır hata olayı, döngü durur", async () => {
    const u = await user();
    for (const [status, needle] of [[401, "anahtarı geçersiz"], [429, "istek sınırında"], [500, "yoğun"]] as const) {
      const events = await collect({ user: u, apiKey: KEY, message: "selam", emit: () => {}, fetchImpl: (async () => reply({ error: {} }, status)) as typeof fetch });
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ type: "error" });
      expect((events[0] as { message: string }).message).toContain(needle);
    }
  });

  it("sonsuz araç döngüsü adım sınırıyla kesilir", async () => {
    const u = await user();
    let n = 0;
    const fetchImpl = (async () => {
      n++;
      return reply({ stop_reason: "tool_use", content: [{ type: "tool_use", id: `t${n}`, name: "list_folder", input: {} }] });
    }) as typeof fetch;
    const events = await collect({ user: u, apiKey: KEY, message: "döngü", emit: () => {}, fetchImpl });
    expect(n).toBeLessThanOrEqual(12);
    expect(events[events.length - 1]).toMatchObject({ type: "error" });
  });
});
