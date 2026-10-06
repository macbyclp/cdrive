"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { withBasePath } from "@/lib/basePath";
import { useToast } from "@/components/ToastProvider";
import { ConfirmDialog } from "@/components/Dialogs";

type Status = {
  state: "idle" | "running" | "success" | "failed" | "rolled_back";
  from: string | null;
  to: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  log: string[];
};
type Commit = { sha: string; message: string; author: string | null; date: string | null; verified: boolean | null };
type Info = {
  current: { version: string; commit: string | null; builtAt: string | null };
  repo: string;
  branch: string;
  configured: boolean;
  status: Status | null;
  updaterError: string | null;
  latest: { sha: string; message: string; date: string | null; verified: boolean | null; ahead: number | null; relation: string; commits: Commit[] } | null;
  latestError: string | null;
};

const short = (s: string | null | undefined) => (s ? s.slice(0, 7) : "?");
const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" }) : "—");

/** Yönetim → Güncelleme: sürüm denetimi ve SSH'siz uzaktan güncelleme (bkz. src/lib/update.ts, deploy/vds/updater). */
export default function UpdatePanel() {
  const t = useTranslations("update");
  const toast = useToast();
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [running, setRunning] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [live, setLive] = useState<Status | null>(null);
  const startedAt = useRef<string | null>(null);
  const logRef = useRef<HTMLPreElement>(null);

  const fetchInfo = useCallback(
    async (refresh: boolean): Promise<Info> => {
      const res = await fetch(withBasePath(`/api/admin/update${refresh ? "?refresh=1" : ""}`));
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("loadFailed"));
      return d as Info;
    },
    [t]
  );

  const apply = useCallback((d: Info) => {
    setInfo(d);
    setError(null);
    if (d.status?.state === "running") {
      startedAt.current = d.status.startedAt;
      setRunning(true);
    }
  }, []);

  const load = useCallback(
    async (refresh = false) => {
      setChecking(true);
      try {
        apply(await fetchInfo(refresh));
      } catch (e) {
        setError(e instanceof Error ? e.message : t("loadFailed"));
      } finally {
        setChecking(false);
      }
    },
    [apply, fetchInfo, t]
  );

  // İlk yükleme: efekt gövdesinde eşzamanlı setState olmasın diye promise zinciriyle.
  useEffect(() => {
    let cancelled = false;
    fetchInfo(false)
      .then((d) => {
        if (!cancelled) apply(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : t("loadFailed"));
      });
    return () => {
      cancelled = true;
    };
  }, [apply, fetchInfo, t]);

  // Güncelleme sürerken durumu 2 sn'de bir sorgula. Uygulama yeniden başlarken istekler
  // başarısız olur — bu beklenen bir durumdur ("yeniden bağlanıyor"), döngü sürer.
  useEffect(() => {
    if (!running) return;
    let stopped = false;
    let fails = 0;
    const tick = async () => {
      try {
        const res = await fetch(withBasePath("/api/admin/update?status=1"), { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const d = (await res.json()) as { status: Status | null };
        if (stopped) return;
        fails = 0;
        setReconnecting(false);
        const st = d.status;
        if (!st) return;
        // Önceki güncellemenin kalıntı sonucunu bu çalıştırmanınki sanma.
        if (startedAt.current && st.startedAt && st.startedAt < startedAt.current) return;
        setLive(st);
        if (st.state !== "running") {
          setRunning(false);
          if (st.state === "success") {
            toast(t("doneToast"), "success");
            setTimeout(() => window.location.reload(), 1800);
          } else if (st.state === "rolled_back") {
            toast(t("rolledBackToast"), "error");
            void load(true);
          } else {
            toast(t("failedToast"), "error");
          }
        }
      } catch {
        if (stopped) return;
        fails++;
        if (fails >= 1) setReconnecting(true);
      }
    };
    const id = setInterval(tick, 2000);
    void tick();
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [running, t, toast, load]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [live?.log.length]);

  async function start() {
    setConfirm(false);
    try {
      // Panelde görülen son commit onaylanır; updater arada dala itilen başka bir commit'i değil bunu kurar.
      const res = await fetch(withBasePath("/api/admin/update"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sha: info?.latest?.sha }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("startFailed"));
      startedAt.current = d.startedAt ?? new Date().toISOString();
      setLive(d);
      setRunning(true);
    } catch (e) {
      toast(e instanceof Error ? e.message : t("startFailed"), "error");
    }
  }

  if (!info) {
    return error ? (
      <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
    ) : (
      <div className="card p-5">
        <div className="skeleton h-5 w-48" />
        <div className="skeleton mt-3 h-4 w-72" />
      </div>
    );
  }

  const { latest } = info;
  const upToDate = latest?.relation === "identical";
  const hasUpdate = latest ? latest.relation === "ahead" || (latest.relation === "unknown" && latest.sha !== info.current.commit) : false;
  const status = live ?? info.status;
  const showLog = status && status.state !== "idle" && status.log.length > 0;

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
              {t("title")}
            </h2>
            <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
              {t("subtitle", { repo: info.repo, branch: info.branch })}
            </p>
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => load(true)} disabled={checking || running}>
              {checking ? t("checking") : t("check")}
            </button>
            <button
              className="btn-primary"
              onClick={() => setConfirm(true)}
              disabled={!info.configured || running || !!info.updaterError || upToDate}
              title={!info.configured ? t("notConfigured") : upToDate ? t("upToDateHint") : undefined}
            >
              {running ? t("updating") : t("updateNow")}
            </button>
          </div>
        </div>

        <dl className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
              {t("running")}
            </dt>
            <dd className="mt-1 text-sm" style={{ color: "var(--text-primary)" }}>
              v{info.current.version} · <code>{short(info.current.commit)}</code>
              <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {info.current.commit ? t("builtAt", { date: when(info.current.builtAt) }) : t("commitUnknown")}
              </div>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
              {t("latest")}
            </dt>
            <dd className="mt-1 text-sm" style={{ color: "var(--text-primary)" }}>
              {latest ? (
                <>
                  <code>{short(latest.sha)}</code> · {latest.message}
                  <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    {when(latest.date)}
                    {latest.verified !== null && (
                      <span className="badge ml-2" title={latest.verified ? t("verifiedHint") : t("unverifiedHint")}>
                        {latest.verified ? t("verified") : t("unverified")}
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <span style={{ color: "var(--text-secondary)" }}>{info.latestError ?? "—"}</span>
              )}
            </dd>
          </div>
        </dl>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          {upToDate && <span className="badge">✓ {t("upToDate")}</span>}
          {hasUpdate && (
            <span className="badge">
              {latest?.ahead != null ? t("behind", { count: latest.ahead }) : t("updateAvailable")}
            </span>
          )}
          {latest?.relation === "behind" && <span className="badge">{t("aheadOfRemote")}</span>}
          {latest?.relation === "diverged" && <span className="badge">{t("diverged")}</span>}
        </div>

        {!info.configured && (
          <p className="mt-4 rounded-xl p-3 text-sm" style={{ background: "var(--surface-muted)", color: "var(--text-secondary)" }}>
            {t("notConfiguredHelp")}
          </p>
        )}
        {info.configured && info.updaterError && (
          <p className="mt-4 rounded-xl p-3 text-sm text-red-600 dark:text-red-400" style={{ background: "var(--surface-muted)" }}>
            {info.updaterError}
          </p>
        )}
      </div>

      {latest && latest.commits.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 pt-4 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            {t("changes")}
          </div>
          <ul>
            {latest.commits.map((c) => (
              <li key={c.sha} className="flex items-start gap-3 border-b px-5 py-2.5 text-sm last:border-0" style={{ borderColor: "var(--border)" }}>
                <code className="mt-0.5 shrink-0 text-xs" style={{ color: "var(--text-tertiary)" }}>
                  {short(c.sha)}
                </code>
                <span className="min-w-0 flex-1" style={{ color: "var(--text-primary)" }}>
                  {c.message}
                  {c.verified === false && (
                    <span className="badge ml-2" title={t("unverifiedHint")}>
                      {t("unverified")}
                    </span>
                  )}
                </span>
                <span className="hidden shrink-0 text-xs sm:inline" style={{ color: "var(--text-tertiary)" }}>
                  {c.author}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(running || showLog) && (
        <div className="card p-5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              {t("log")}
            </span>
            {status && (
              <span className="badge">
                {status.state === "running" && t("state.running")}
                {status.state === "success" && `✓ ${t("state.success")}`}
                {status.state === "failed" && `✕ ${t("state.failed")}`}
                {status.state === "rolled_back" && `↩ ${t("state.rolledBack")}`}
              </span>
            )}
          </div>
          {reconnecting && (
            <p className="mb-2 text-sm" style={{ color: "var(--text-secondary)" }}>
              {t("reconnecting")}
            </p>
          )}
          <pre
            ref={logRef}
            className="max-h-72 overflow-auto rounded-xl p-3 text-xs leading-relaxed"
            style={{ background: "var(--surface-muted)", color: "var(--text-primary)", whiteSpace: "pre-wrap" }}
          >
            {(status?.log ?? []).join("\n") || t("waitingLog")}
          </pre>
          {status?.error && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{status.error}</p>
          )}
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          title={t("confirmTitle")}
          description={t("confirmDesc")}
          confirmLabel={t("confirmButton")}
          danger={false}
          onConfirm={start}
          onCancel={() => setConfirm(false)}
        />
      )}
    </div>
  );
}
