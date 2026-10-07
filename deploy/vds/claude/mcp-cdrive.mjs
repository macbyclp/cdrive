#!/usr/bin/env node
// Cdrive MCP köprüsü — Claude CLI'ın stdio üzerinden konuştuğu minimal (sıfır bağımlılık) MCP sunucusu.
//
// Araçların HİÇBİRİ diske dokunmaz: hepsi Cdrive'ın /api/claude/tools/* uçlarına, bu sohbete özel
// kısa ömürlü TOOL_TOKEN (kullanıcıya bağlı) ile HTTP isteği atar. Yetki kontrolü Cdrive tarafındadır;
// Claude yalnızca token'ın sahibi kullanıcının görebildiği/yapabildiği şeyleri görür/yapar.

import readline from "node:readline";

const BASE = (process.env.CDRIVE_URL || "").replace(/\/+$/, "");
const TOKEN = process.env.TOOL_TOKEN || "";

const TOOLS = [
  {
    name: "list_folder",
    description:
      "Bir klasörün içeriğini (alt klasörler ve dosyalar) listeler. folderId vermezsen kullanıcının kök dizinini (Sürücüm) listeler.",
    inputSchema: { type: "object", properties: { folderId: { type: ["string", "null"], description: "Klasör kimliği; kök için boş bırak" } } },
  },
  {
    name: "search_files",
    description: "Kullanıcının erişebildiği dosyalarda ad ve içerik araması yapar (en çok 20 sonuç).",
    inputSchema: { type: "object", properties: { query: { type: "string", description: "Aranacak metin" } }, required: ["query"] },
  },
  {
    name: "read_file",
    description:
      "Bir dosyanın içeriğini metin olarak okur (metin, JSON, CSV, PDF, Word, Excel, PowerPoint). Uzun dosyalar parça parça okunur: truncated true ise offset ile devam et.",
    inputSchema: {
      type: "object",
      properties: { fileId: { type: "string" }, offset: { type: "integer", description: "Okumaya başlanacak karakter konumu (varsayılan 0)" } },
      required: ["fileId"],
    },
  },
  {
    name: "propose_edit",
    description:
      "Var olan bir DÜZ METİN dosyası için düzenleme ÖNERİR. content, dosyanın TAM yeni içeriğidir. Dosya değiştirilmez; kullanıcı panelde farkı görüp onaylarsa yeni sürüm olarak kaydedilir.",
    inputSchema: {
      type: "object",
      properties: { fileId: { type: "string" }, content: { type: "string", description: "Dosyanın tam yeni içeriği" }, summary: { type: "string", description: "Değişikliğin kısa açıklaması" } },
      required: ["fileId", "content"],
    },
  },
  {
    name: "propose_new_file",
    description:
      "Yeni bir düz metin dosyası (txt, md, csv, json, html…) oluşturmayı ÖNERİR. Dosya hemen oluşturulmaz; kullanıcı onaylarsa oluşturulur.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Dosya adı (uzantısıyla)" },
        content: { type: "string" },
        folderId: { type: ["string", "null"], description: "Hedef klasör; kök için boş" },
        summary: { type: "string" },
      },
      required: ["name", "content"],
    },
  },
];

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

async function callTool(name, args) {
  if (!TOOLS.some((t) => t.name === name)) throw new Error(`Bilinmeyen araç: ${name}`);
  const res = await fetch(`${BASE}/api/claude/tools/${name}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(args ?? {}),
    signal: AbortSignal.timeout(60_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { isError: true, text: data.error || `Cdrive hata döndürdü (${res.status})` };
  return { isError: false, text: JSON.stringify(data) };
}

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", async (line) => {
  let req;
  try {
    req = JSON.parse(line);
  } catch {
    return;
  }
  const { id, method, params } = req;
  try {
    if (method === "initialize") {
      send({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: params?.protocolVersion || "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "cdrive", version: "1.0.0" },
        },
      });
    } else if (method === "ping") {
      send({ jsonrpc: "2.0", id, result: {} });
    } else if (method === "tools/list") {
      send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
    } else if (method === "tools/call") {
      const out = await callTool(params?.name, params?.arguments);
      send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: out.text }], isError: out.isError } });
    } else if (id !== undefined) {
      send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Desteklenmeyen yöntem: ${method}` } });
    }
  } catch (e) {
    if (id !== undefined) {
      send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: `Araç hatası: ${e.message}` }], isError: true } });
    }
  }
});
