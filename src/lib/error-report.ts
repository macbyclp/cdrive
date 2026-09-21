/**
 * Hafif, bağımlılıksız hata bildirimi (Sentry benzeri bir SaaS yerine, kendi barındırılan çözüm):
 *  - her hata tek satır JSON olarak stdout/stderr'e yazılır (docker logs / journald ile toplanır),
 *  - ERROR_WEBHOOK_URL tanımlıysa aynı yük oraya POST edilir (Slack/Discord/n8n/kendi toplayıcınız).
 * Yük kasıtlı olarak küçük tutulur: istek başlıkları/çerezler/gövde ASLA eklenmez (gizli değer sızmasın).
 */
export type ErrorReport = {
  source: "server" | "client";
  message: string;
  digest?: string;
  path?: string;
  method?: string;
  stack?: string;
};

const cut = (v: string | undefined, n: number) => (v ? v.slice(0, n) : undefined);

export async function reportError(r: ErrorReport) {
  const payload = {
    ts: new Date().toISOString(),
    level: "error",
    app: "cdrive",
    source: r.source,
    message: cut(r.message, 500) ?? "",
    digest: cut(r.digest, 100),
    path: cut(r.path, 300)?.split("?")[0], // sorgu dizgesi (token vb.) atılır
    method: cut(r.method, 10),
    stack: cut(r.stack, 2000),
  };
  console.error(JSON.stringify(payload));
  const url = process.env.ERROR_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    /* bildirim başarısız olsa da uygulama etkilenmesin */
  }
}
