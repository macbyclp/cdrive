import { describe, it, expect, afterEach, afterAll, vi, beforeEach } from "vitest";
import { rmSync } from "fs";
import { prisma } from "@/lib/prisma";
import { createFileFromBuffer } from "@/lib/file-versions";
import { claudeKeyStatus, decryptApiKey, encryptApiKey, getClaudeApiKey, isValidApiKeyFormat, setClaudeApiKey } from "@/lib/claude-key";
import { runAgent, verifyApiKey, type AgentEvent } from "@/lib/claude-agent";
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

describe("sistem API anahtarı saklama", () => {
  afterEach(async () => {
    await setClaudeApiKey(null);
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("şifreler (düz metin DB'de yok), geri çözer, bozuk/yanlış sırrı reddeder", async () => {
    await setClaudeApiKey(KEY);
    const row = await prisma.systemSettings.findUniqueOrThrow({ where: { id: 1 }, select: { claudeApiKeyEnc: true } });
    expect(row.claudeApiKeyEnc).toBeTruthy();
    expect(row.claudeApiKeyEnc).not.toContain(KEY);
    expect(await getClaudeApiKey()).toBe(KEY);
    expect(await claudeKeyStatus()).toEqual({ configured: true, source: "panel", last4: KEY.slice(-4) });

    // SESSION_SECRET değişirse çözülemez → null, hata fırlatmaz
    const blob = encryptApiKey(KEY);
    process.env.SESSION_SECRET = "baska-bir-sir-baska-bir-sir-baska-bir-sir-9";
    expect(decryptApiKey(blob)).toBeNull();
    process.env.SESSION_SECRET = "test-secret-test-secret-test-secret-123";
    expect(decryptApiKey(blob.slice(0, -4) + "AAAA")).toBeNull(); // kurcalanmış şifreli metin (GCM etiketi)

    await setClaudeApiKey(null);
    expect(await getClaudeApiKey()).toBeNull();
    expect(await claudeKeyStatus()).toEqual({ configured: false, source: null, last4: null });
  });

  it("panelde anahtar yoksa ANTHROPIC_API_KEY ortam değişkeni; panel anahtarı önceliklidir; geçersiz biçimli env yok sayılır", async () => {
    process.env.ANTHROPIC_API_KEY = "geçersiz";
    expect(await getClaudeApiKey()).toBeNull();
    process.env.ANTHROPIC_API_KEY = "sk-ant-api03-ENVENVENVENVENVENVENV99";
    expect(await getClaudeApiKey()).toBe("sk-ant-api03-ENVENVENVENVENVENVENV99");
    expect((await claudeKeyStatus()).source).toBe("env");
    await setClaudeApiKey(KEY);
    expect(await getClaudeApiKey()).toBe(KEY);
  });

  it("biçim denetimi", () => {
    expect(isValidApiKeyFormat(KEY)).toBe(true);
    expect(isValidApiKeyFormat("sk-ant-")).toBe(false);
    expect(isValidApiKeyFormat("sk-proj-abcdefghijklmnopqrstuvwxyz")).toBe(false);
    expect(isValidApiKeyFormat(`${KEY}\nX-Evil: 1`)).toBe(false);
  });

  it("verifyApiKey: 401 → invalid, 200 → ok, ağ hatası → unreachable", async () => {
    expect(await verifyApiKey(KEY, (async () => reply({}, 401)) as typeof fetch)).toBe("invalid");
    expect(await verifyApiKey(KEY, (async () => reply({ data: [] })) as typeof fetch)).toBe("ok");
    expect(await verifyApiKey(KEY, (async () => { throw new Error("ağ"); }) as typeof fetch)).toBe("unreachable");
  });
});

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
    for (const [status, needle] of [[401, "anahtarınız geçersiz"], [429, "istek sınırına"], [500, "yoğun"]] as const) {
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
