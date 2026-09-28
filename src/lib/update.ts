// Uzaktan güncelleme — uygulama tarafı. Kodu çeken/derleyen/yeniden başlatan iş, docker
// soketine erişimi olan AYRI bir "updater" sidecar'ındadır (bkz. deploy/vds/updater);
// uygulama yalnızca (1) GitHub'dan yeni sürüm var mı diye bakar, (2) updater'a "güncelle"
// der ve (3) durumu/günlüğü gösterir. Uygulamanın docker soketine erişimi YOKTUR.

import pkg from "../../package.json";

export const UPDATE_REPO = process.env.UPDATE_REPO || "macbyclp/cdrive";
export const UPDATE_BRANCH = process.env.UPDATE_BRANCH || "main";

export type VersionInfo = { version: string; commit: string | null; builtAt: string | null };

/** Çalışan sürüm: package.json sürümü + Docker build sırasında gömülen git commit ve zaman. */
export function currentVersion(): VersionInfo {
  const commit = process.env.APP_COMMIT && process.env.APP_COMMIT !== "unknown" ? process.env.APP_COMMIT : null;
  return { version: pkg.version, commit, builtAt: process.env.APP_BUILT_AT || null };
}

export function shortSha(sha: string | null | undefined): string {
  return sha ? sha.slice(0, 7) : "?";
}

export function updaterConfig(): { url: string; token: string } | null {
  const url = process.env.UPDATER_URL?.trim().replace(/\/+$/, "");
  const token = process.env.UPDATER_TOKEN?.trim();
  if (!url || !token) return null;
  return { url, token };
}

export type UpdaterStatus = {
  state: "idle" | "running" | "success" | "failed" | "rolled_back";
  from: string | null;
  to: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  log: string[];
};

export class UpdaterError extends Error {
  status = 502;
}

/** Updater'a Bearer belirteciyle istek atar; ulaşılamazsa UpdaterError fırlatır. */
export async function updaterFetch<T>(path: string, init?: { method?: string; timeoutMs?: number }): Promise<T> {
  const cfg = updaterConfig();
  if (!cfg) throw new UpdaterError("Güncelleme servisi yapılandırılmamış (UPDATER_URL / UPDATER_TOKEN)");
  let res: Response;
  try {
    res = await fetch(`${cfg.url}${path}`, {
      method: init?.method ?? "GET",
      headers: { Authorization: `Bearer ${cfg.token}` },
      signal: AbortSignal.timeout(init?.timeoutMs ?? 6000),
      cache: "no-store",
    });
  } catch {
    throw new UpdaterError("Güncelleme servisine ulaşılamıyor");
  }
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    const err = new UpdaterError(body.error ?? `Güncelleme servisi hata döndürdü (${res.status})`);
    err.status = res.status === 409 ? 409 : 502;
    throw err;
  }
  return body;
}

export type CommitSummary = { sha: string; message: string; author: string | null; date: string | null };

export type LatestInfo = {
  sha: string;
  message: string;
  date: string | null;
  /** current → latest arasındaki yeni commit sayısı; mevcut commit bilinmiyorsa null. */
  ahead: number | null;
  /** "identical" güncel, "ahead" güncelleme var, "behind"/"diverged" beklenmedik durum. */
  relation: "identical" | "ahead" | "behind" | "diverged" | "unknown";
  commits: CommitSummary[];
};

type GhCommit = { sha: string; commit: { message: string; author?: { name?: string; date?: string } } };

export function summarizeCompare(json: {
  status?: string;
  ahead_by?: number;
  commits?: GhCommit[];
}): Pick<LatestInfo, "ahead" | "relation" | "commits"> {
  const relation = (["identical", "ahead", "behind", "diverged"] as const).find((r) => r === json.status) ?? "unknown";
  const commits = (json.commits ?? [])
    .map((c) => ({
      sha: c.sha,
      message: c.commit.message.split("\n")[0].slice(0, 200),
      author: c.commit.author?.name ?? null,
      date: c.commit.author?.date ?? null,
    }))
    .reverse() // en yeni üstte
    .slice(0, 30);
  return { ahead: typeof json.ahead_by === "number" ? json.ahead_by : null, relation, commits };
}

let cache: { key: string; at: number; value: LatestInfo } | null = null;

async function gh<T>(path: string): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "cdrive-updater-check",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com${path}`, { headers, signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!res.ok) throw new UpdaterError(`GitHub'a erişilemedi (${res.status})`);
  return (await res.json()) as T;
}

/** UPDATE_REPO/UPDATE_BRANCH'in en son commit'ini ve çalışan sürümle farkını getirir (60 sn önbellek). */
export async function fetchLatest(currentCommit: string | null, force = false): Promise<LatestInfo> {
  const key = `${UPDATE_REPO}@${UPDATE_BRANCH}:${currentCommit ?? ""}`;
  if (!force && cache && cache.key === key && Date.now() - cache.at < 60_000) return cache.value;

  const head = await gh<GhCommit>(`/repos/${UPDATE_REPO}/commits/${encodeURIComponent(UPDATE_BRANCH)}`);
  let value: LatestInfo = {
    sha: head.sha,
    message: head.commit.message.split("\n")[0].slice(0, 200),
    date: head.commit.author?.date ?? null,
    ahead: null,
    relation: "unknown",
    commits: [],
  };
  if (currentCommit) {
    if (currentCommit === head.sha) {
      value = { ...value, ahead: 0, relation: "identical" };
    } else {
      try {
        const cmp = await gh<{ status?: string; ahead_by?: number; commits?: GhCommit[] }>(
          `/repos/${UPDATE_REPO}/compare/${currentCommit}...${head.sha}`
        );
        value = { ...value, ...summarizeCompare(cmp) };
      } catch {
        // Karşılaştırma başarısızsa (ör. commit bulunamadı) yine de son sürüm bilgisi gösterilir.
      }
    }
  }
  cache = { key, at: Date.now(), value };
  return value;
}
