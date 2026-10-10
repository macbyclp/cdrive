"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ToastProvider";
import { withBasePath } from "@/lib/basePath";

type TokenRow = { id: string; name: string; prefix: string; expiresAt: string; lastUsedAt: string | null; lastUsedAgent: string | null; createdAt: string };

function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" }) : "—";
}

function CodeBlock({ label, text }: { label: string; text: string }) {
  const toast = useToast();
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs" style={{ color: "var(--text-secondary)" }}>
        <span>{label}</span>
        <button
          type="button"
          className="btn-ghost !px-2 !py-0.5 text-xs"
          onClick={() => navigator.clipboard.writeText(text).then(() => toast("Kopyalandı", "success"), () => toast("Kopyalanamadı", "error"))}
        >
          Kopyala
        </button>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-xl p-3 text-xs" style={{ background: "var(--surface-muted)", color: "var(--text-primary)" }}>
        {text}
      </pre>
    </div>
  );
}

/** Hesap ayarları: Claude Code / Codex gibi yapay zekâ araçlarının Cdrive'a dosya göndermesi için erişim anahtarı + kurulum komutları. */
export default function AiBridgeCard() {
  const toast = useToast();
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [name, setName] = useState("Claude Code");
  const [days, setDays] = useState(90);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);

  function load() {
    fetch(withBasePath("/api/account/tokens"))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setTokens(d.tokens))
      .catch(() => {});
  }
  useEffect(load, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await fetch(withBasePath("/api/account/tokens"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, days }),
    });
    setBusy(false);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(d.error ?? "Anahtar oluşturulamadı");
      return;
    }
    setFresh(d.token);
    load();
  }

  async function revoke(id: string) {
    const res = await fetch(withBasePath(`/api/account/tokens/${id}`), { method: "DELETE" });
    if (res.ok) {
      toast("Anahtar iptal edildi", "success");
      load();
    }
  }

  const origin = typeof window === "undefined" ? "" : window.location.origin + withBasePath("");
  const tok = fresh ?? "cdrv_…";
  const dl = `New-Item -ItemType Directory -Force "$HOME\\cdrive-mcp" | Out-Null; Invoke-WebRequest "${origin}/cdrive-mcp/server.mjs" -OutFile "$HOME\\cdrive-mcp\\server.mjs"`;
  const claudeCmd = `claude mcp add cdrive --scope user -e CDRIVE_URL=${origin} -e CDRIVE_TOKEN=${tok} -- node "$HOME\\cdrive-mcp\\server.mjs"`;
  const codexCmd = `codex mcp add cdrive --env CDRIVE_URL=${origin} --env CDRIVE_TOKEN=${tok} -- node "$HOME\\cdrive-mcp\\server.mjs"`;

  return (
    <div className="card space-y-4 p-5">
      <div>
        <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          Yapay zekâ bağlantısı (Claude Code, Codex)
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          Bir yapay zekâ aracına &ldquo;bu tabloyu Cdrive ana klasörüme gönder&rdquo; diyebilmek için erişim anahtarı oluştur. Araç yalnızca
          senin adına dosya yükleyebilir, arayabilir ve okuyabilir; yetkilerin neyse o kadar. Yüklenince bildirim gelir (masaüstü uygulamasında
          tepsi bildirimi). Aynı adlı dosya varsa yeni sürüm olur.
        </p>
      </div>

      <form onSubmit={create} className="flex flex-wrap items-end gap-2">
        <label className="flex-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          Ad
          <input required maxLength={60} className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="text-xs" style={{ color: "var(--text-secondary)" }}>
          Geçerlilik
          <select className="input mt-1" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={30}>30 gün</option>
            <option value={90}>90 gün</option>
            <option value={365}>1 yıl</option>
          </select>
        </label>
        <button className="btn-primary" disabled={busy || !name.trim()}>
          Anahtar oluştur
        </button>
      </form>
      {error && (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      {fresh && (
        <div className="space-y-3 rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
          <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            Anahtar oluşturuldu. Bir daha gösterilmeyecek; şimdi kopyala.
          </p>
          <CodeBlock label="Erişim anahtarı" text={fresh} />
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Kurulum (Windows PowerShell, Node.js 18+ gerekli) — önce bağlayıcıyı indir, sonra kullandığın araca ekle:
          </p>
          <CodeBlock label="1) Bağlayıcıyı indir" text={dl} />
          <CodeBlock label="2a) Claude Code" text={claudeCmd} />
          <CodeBlock label="2b) Codex" text={codexCmd} />
          <button type="button" className="btn-secondary text-sm" onClick={() => setFresh(null)}>
            Kopyaladım, gizle
          </button>
        </div>
      )}

      {tokens.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Etkin anahtarlar
          </h3>
          {tokens.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 rounded-xl p-3 text-sm" style={{ background: "var(--surface-muted)" }}>
              <div className="min-w-0">
                <div className="truncate font-medium" style={{ color: "var(--text-primary)" }}>
                  {t.name} <span className="font-normal" style={{ color: "var(--text-secondary)" }}>· {t.prefix}…</span>
                </div>
                <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  Son kullanım: {fmt(t.lastUsedAt)}
                  {t.lastUsedAgent ? ` (${t.lastUsedAgent})` : ""} · Bitiş: {fmt(t.expiresAt)}
                </div>
              </div>
              <button type="button" className="btn-secondary shrink-0 text-sm" onClick={() => revoke(t.id)}>
                İptal et
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
