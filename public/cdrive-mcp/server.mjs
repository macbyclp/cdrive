#!/usr/bin/env node
// Cdrive MCP sunucusu — Claude Code, Codex ve diğer MCP istemcilerinin Cdrive'a dosya göndermesi / dosya araması için.
// Sıfır bağımlılık (yalnızca Node 18+). stdio üzerinden JSON-RPC konuşur.
//
// Yapılandırma (ortam değişkenleri):
//   CDRIVE_URL     Cdrive adresi, ör. https://cdrive.calapverdi.tr
//   CDRIVE_TOKEN   Hesap ayarları → "Yapay zekâ bağlantısı"nda oluşturulan erişim anahtarı (cdrv_…)
//   CDRIVE_ALLOW_SENSITIVE=1   (isteğe bağlı) .env / özel anahtar gibi hassas dosyaların yüklenmesine izin verir
//
// Anahtar yalnızca /api/agent/* uçlarında geçerlidir (yükle, listele, ara, oku); başka hiçbir şeye erişemez.
// Yetki ve kota denetimi Cdrive tarafındadır: anahtarın sahibi olan kullanıcı ne görebiliyorsa o.

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const BASE = (process.env.CDRIVE_URL || "").trim().replace(/\/+$/, "");
const TOKEN = (process.env.CDRIVE_TOKEN || "").trim();
const MAX_BYTES = 100 * 1024 * 1024;
let agent = "claude-code"; // initialize'daki clientInfo.name'den güncellenir

const MIME = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  pdf: "application/pdf",
  csv: "text/csv",
  txt: "text/plain",
  md: "text/markdown",
  json: "application/json",
  html: "text/html",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  zip: "application/zip",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
};

const TOOLS = [
  {
    name: "cdrive_upload_file",
    description:
      "Bilgisayardaki bir dosyayı (örn. oluşturduğun Excel, Word, PDF, CSV) kullanıcının Cdrive sürücüne yükler. folder_id verilmezse ANA klasöre (kök) gider. Aynı adlı dosya varsa yeni SÜRÜM olur. İçeriği metin olarak vermek istersen path yerine name + content kullan.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Yüklenecek yerel dosyanın yolu (mutlak yol önerilir)" },
        content: { type: "string", description: "path yerine: dosyanın metin içeriği (name zorunlu)" },
        name: { type: "string", description: "Cdrive'daki dosya adı (varsayılan: yerel dosya adı)" },
        folder_id: { type: ["string", "null"], description: "Hedef klasör kimliği (cdrive_list_folder ile bulunur); boşsa ana klasör" },
      },
    },
  },
  {
    name: "cdrive_list_folder",
    description: "Bir Cdrive klasörünün içeriğini listeler (alt klasörler ve dosyalar). folder_id boşsa ana klasör.",
    inputSchema: { type: "object", properties: { folder_id: { type: ["string", "null"] } } },
  },
  {
    name: "cdrive_search_files",
    description: "Cdrive'da dosya adı ve içeriğinde arama yapar (kullanıcının erişebildiği dosyalar, en çok 20 sonuç).",
    inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  },
  {
    name: "cdrive_read_file",
    description:
      "Bir Cdrive dosyasının içeriğini metin olarak okur (metin, CSV, PDF, Word, Excel, PowerPoint). Uzunsa truncated true döner; offset ile devam et.",
    inputSchema: {
      type: "object",
      properties: { file_id: { type: "string" }, offset: { type: "integer", description: "Başlangıç karakter konumu (varsayılan 0)" } },
      required: ["file_id"],
    },
  },
];

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function headers(extra = {}) {
  return { Authorization: `Bearer ${TOKEN}`, "X-Cdrive-Agent": agent, ...extra };
}

async function api(method, pathAndQuery, body) {
  if (!BASE || !TOKEN) {
    return { ok: false, text: "Cdrive bağlantısı yapılandırılmamış: CDRIVE_URL ve CDRIVE_TOKEN ortam değişkenleri gerekli." };
  }
  let res;
  try {
    res = await fetch(`${BASE}${pathAndQuery}`, { method, headers: headers(), body, signal: AbortSignal.timeout(120_000) });
  } catch (e) {
    return { ok: false, text: `Cdrive'a ulaşılamadı (${e.message}). Ağ/adres ayarını kontrol et.` };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, text: data.error || `Cdrive hata döndürdü (${res.status})` };
  return { ok: true, data };
}

// Gizli anahtar/parola dosyalarının yanlışlıkla (ya da dosya içindeki bir talimatla) yüklenmesini engelle.
function isSensitive(p) {
  if (process.env.CDRIVE_ALLOW_SENSITIVE === "1") return false;
  const norm = p.replace(/\\/g, "/").toLowerCase();
  const base = path.posix.basename(norm);
  return (
    /(^|\/)\.(ssh|aws|gnupg|kube|docker)(\/|$)/.test(norm) ||
    /^(\.env(\..*)?|id_rsa|id_ed25519|id_ecdsa|\.npmrc|\.netrc|\.pgpass|credentials|secrets?\.(json|ya?ml|txt))$/.test(base) ||
    /\.(pem|key|pfx|p12|kdbx)$/.test(base)
  );
}

async function upload(args) {
  const folderId = args.folder_id || "";
  let buf;
  let name = typeof args.name === "string" ? args.name.trim() : "";
  if (typeof args.path === "string" && args.path) {
    const p = path.resolve(args.path);
    if (isSensitive(p)) return { isError: true, text: "Bu dosya hassas görünüyor (anahtar/parola/.env); yüklenmedi. Gerçekten gerekliyse kullanıcı CDRIVE_ALLOW_SENSITIVE=1 ayarlamalı." };
    let st;
    try {
      st = fs.statSync(p);
    } catch {
      return { isError: true, text: `Dosya bulunamadı: ${p}` };
    }
    if (!st.isFile()) return { isError: true, text: `Bu bir dosya değil: ${p}` };
    if (st.size === 0) return { isError: true, text: "Dosya boş" };
    if (st.size > MAX_BYTES) return { isError: true, text: "Dosya 100 MB sınırını aşıyor" };
    buf = fs.readFileSync(p);
    if (!name) name = path.basename(p);
  } else if (typeof args.content === "string") {
    if (!name) return { isError: true, text: "content ile yüklerken name (dosya adı) zorunlu" };
    buf = Buffer.from(args.content, "utf-8");
    if (buf.length === 0) return { isError: true, text: "İçerik boş" };
    if (buf.length > MAX_BYTES) return { isError: true, text: "İçerik 100 MB sınırını aşıyor" };
  } else {
    return { isError: true, text: "path veya (name + content) verilmeli" };
  }
  const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  const form = new FormData();
  form.append("file", new Blob([buf], { type: MIME[ext] || "application/octet-stream" }), name);
  form.append("name", name);
  if (folderId) form.append("folderId", folderId);
  const r = await api("POST", "/api/agent/upload", form);
  if (!r.ok) return { isError: true, text: r.text };
  const d = r.data;
  return {
    isError: false,
    text: `${d.versioned ? "Yeni sürüm olarak yüklendi" : "Yüklendi"}: "${d.name}" (${d.size} bayt) → ${d.folderId ? "klasör " + d.folderId : "Cdrive ana klasörü"}. Kullanıcıya Cdrive'dan bildirim gitti.`,
  };
}

async function callTool(name, a = {}) {
  switch (name) {
    case "cdrive_upload_file":
      return upload(a);
    case "cdrive_list_folder": {
      const r = await api("GET", `/api/agent/list${a.folder_id ? `?folderId=${encodeURIComponent(a.folder_id)}` : ""}`);
      return r.ok ? { isError: false, text: JSON.stringify(r.data) } : { isError: true, text: r.text };
    }
    case "cdrive_search_files": {
      const r = await api("GET", `/api/agent/search?q=${encodeURIComponent(String(a.query ?? ""))}`);
      return r.ok ? { isError: false, text: JSON.stringify(r.data) } : { isError: true, text: r.text };
    }
    case "cdrive_read_file": {
      const r = await api("GET", `/api/agent/read?fileId=${encodeURIComponent(String(a.file_id ?? ""))}&offset=${Number(a.offset) > 0 ? Number(a.offset) : 0}`);
      return r.ok ? { isError: false, text: JSON.stringify(r.data) } : { isError: true, text: r.text };
    }
    default:
      throw new Error(`Bilinmeyen araç: ${name}`);
  }
}

function agentFromClient(info) {
  const n = String(info?.name ?? "").toLowerCase();
  if (n.includes("codex")) return "codex";
  if (n.includes("claude")) return "claude-code";
  if (n.includes("cursor")) return "cursor";
  if (n.includes("gemini")) return "gemini";
  return "claude-code";
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
      agent = process.env.CDRIVE_AGENT || agentFromClient(params?.clientInfo);
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
      send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: out.text }], isError: !!out.isError } });
    } else if (id !== undefined) {
      send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Desteklenmeyen yöntem: ${method}` } });
    }
  } catch (e) {
    if (id !== undefined) send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: `Araç hatası: ${e.message}` }], isError: true } });
  }
});
