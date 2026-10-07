"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { diffLines } from "diff";
import { withBasePath } from "@/lib/basePath";
import { useToast } from "@/components/ToastProvider";

type ToolEvent = { tool: string; label: string };
type Msg = {
  id: string;
  role: "user" | "assistant";
  text: string;
  tools: ToolEvent[];
  proposals: string[];
  error?: string;
  streaming?: boolean;
};

type Proposal = {
  id: string;
  kind: "edit" | "create";
  name: string;
  summary: string | null;
  status: "PENDING" | "APPLIED" | "REJECTED";
  content: string;
  oldText: string | null;
  stale: boolean;
};

export function ClaudeLogo({ size = 22 }: { size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={withBasePath("/claude-logo.svg")} alt="" width={size} height={size} style={{ width: size, height: size, objectFit: "contain" }} />;
}

const uid = () => Math.random().toString(36).slice(2, 10);
const storageKey = (userId: string) => `cdrive-claude-chat-${userId}`;

/** Hafif Markdown: ``` kod blokları, `satır içi kod` ve **kalın** (HTML üretmez — XSS riski yok). */
function RichText({ text }: { text: string }) {
  const blocks = text.split(/```[a-zA-Z]*\n?/);
  return (
    <>
      {blocks.map((chunk, i) =>
        i % 2 === 1 ? (
          <pre
            key={i}
            className="my-2 max-h-56 overflow-auto rounded-xl p-2 text-xs"
            style={{ background: "var(--surface)", whiteSpace: "pre-wrap" }}
          >
            {chunk.replace(/\n$/, "")}
          </pre>
        ) : (
          <span key={i}>
            {chunk.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g).map((part, j) =>
              part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
                <strong key={j}>{part.slice(2, -2)}</strong>
              ) : part.startsWith("`") && part.endsWith("`") && part.length > 2 ? (
                <code key={j} className="rounded px-1 text-[0.85em]" style={{ background: "var(--surface)" }}>
                  {part.slice(1, -1)}
                </code>
              ) : (
                part
              )
            )}
          </span>
        )
      )}
    </>
  );
}

/** Öneri kartı: farkı gösterir, kullanıcı "Uygula" derse yeni sürüm olarak yazılır (Claude doğrudan yazmaz). */
function ProposalCard({ id, onApplied }: { id: string; onApplied: () => void }) {
  const t = useTranslations("claude");
  const toast = useToast();
  const [p, setP] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(withBasePath(`/api/claude/proposals/${id}`))
      .then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => ({})) }))
      .then(({ ok, d }) => {
        if (cancelled) return;
        if (ok) setP(d as Proposal);
        else setError(d.error ?? t("proposalLoadFailed"));
      })
      .catch(() => !cancelled && setError(t("proposalLoadFailed")));
    return () => {
      cancelled = true;
    };
  }, [id, t]);

  async function decide(action: "apply" | "reject") {
    setBusy(true);
    try {
      const res = await fetch(withBasePath(`/api/claude/proposals/${id}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error ?? t("decideFailed"));
        return;
      }
      setP((cur) => (cur ? { ...cur, status: d.status } : cur));
      if (action === "apply") {
        toast(t("appliedToast", { name: d.name ?? p?.name ?? "" }), "success");
        onApplied();
      }
    } catch {
      setError(t("decideFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (error && !p) {
    return (
      <div className="rounded-xl border px-3 py-2 text-xs" style={{ borderColor: "var(--border)", color: "var(--danger)" }}>
        {error}
      </div>
    );
  }
  if (!p) return <div className="skeleton h-16 w-full" />;

  const parts = p.kind === "edit" && p.oldText !== null ? diffLines(p.oldText, p.content) : null;
  const added = parts ? parts.filter((x) => x.added).reduce((n, x) => n + (x.count ?? 0), 0) : p.content.split("\n").length;
  const removed = parts ? parts.filter((x) => x.removed).reduce((n, x) => n + (x.count ?? 0), 0) : 0;

  return (
    <div className="rounded-2xl border p-3 text-sm" style={{ borderColor: "var(--glass-line)", background: "var(--surface-muted)" }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-semibold" style={{ color: "var(--text-primary)" }}>
            {p.kind === "create" ? t("newFile") : t("editFile")}: {p.name}
          </div>
          {p.summary && (
            <div className="mt-0.5 text-xs" style={{ color: "var(--text-secondary)" }}>
              {p.summary}
            </div>
          )}
          <div className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
            +{added} {removed > 0 && <>/ −{removed}</>} {t("lines")}
          </div>
        </div>
        {p.status !== "PENDING" && (
          <span className="badge shrink-0">{p.status === "APPLIED" ? `✓ ${t("applied")}` : t("rejected")}</span>
        )}
      </div>

      {p.stale && p.status === "PENDING" && (
        <div className="mt-2 text-xs" style={{ color: "var(--danger)" }}>
          {t("stale")}
        </div>
      )}

      <button type="button" className="btn-ghost mt-2 !px-2 !py-1 text-xs" onClick={() => setOpen((o) => !o)}>
        {open ? t("hideDiff") : t("showDiff")}
      </button>
      {open && (
        <pre
          className="mt-1 max-h-64 overflow-auto rounded-xl p-2 text-[11px] leading-relaxed"
          style={{ background: "var(--surface)", color: "var(--text-primary)", whiteSpace: "pre-wrap" }}
        >
          {parts
            ? parts.map((x, i) => (
                <span
                  key={i}
                  style={{
                    display: "block",
                    background: x.added ? "rgb(34 197 94 / 0.16)" : x.removed ? "rgb(239 68 68 / 0.16)" : "transparent",
                    opacity: x.added || x.removed ? 1 : 0.55,
                  }}
                >
                  {x.value.replace(/\n$/, "").split("\n").map((l) => `${x.added ? "+ " : x.removed ? "− " : "  "}${l}`).join("\n")}
                </span>
              ))
            : p.content}
        </pre>
      )}

      {error && (
        <div className="mt-2 text-xs" style={{ color: "var(--danger)" }}>
          {error}
        </div>
      )}
      {p.status === "PENDING" && (
        <div className="mt-3 flex gap-2">
          <button type="button" className="btn-primary !px-3 !py-1.5 text-xs" disabled={busy || p.stale} onClick={() => decide("apply")}>
            {t("apply")}
          </button>
          <button type="button" className="btn-secondary !px-3 !py-1.5 text-xs" disabled={busy} onClick={() => decide("reject")}>
            {t("reject")}
          </button>
        </div>
      )}
    </div>
  );
}

/** Claude yardımcısı paneli — sağda cam çekmece (telefonda alttan açılan sayfa). */
export default function ClaudePanel({ userId, onClose }: { userId: string; onClose: () => void }) {
  const t = useTranslations("claude");
  const [messages, setMessages] = useState<Msg[]>(() => {
    try {
      const raw = sessionStorage.getItem(storageKey(userId));
      return raw ? (JSON.parse(raw) as Msg[]).map((m) => ({ ...m, streaming: false })) : [];
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef(messages);

  useEffect(() => {
    messagesRef.current = messages;
    try {
      sessionStorage.setItem(storageKey(userId), JSON.stringify(messages.slice(-40)));
    } catch {
      /* depolama kapalıysa sohbet yalnızca bu açılışta kalır */
    }
  }, [messages, userId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  useEffect(() => {
    let cancelled = false;
    fetch(withBasePath("/api/claude/chat"))
      .then((r) => r.json())
      .then((d) => !cancelled && setConfigured(!!d.configured))
      .catch(() => !cancelled && setConfigured(false));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      cancelled = true;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const patchLast = useCallback((fn: (m: Msg) => Msg) => {
    setMessages((prev) => (prev.length ? [...prev.slice(0, -1), fn(prev[prev.length - 1])] : prev));
  }, []);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const history = messagesRef.current
      .filter((m) => m.text)
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.text }));
    setInput("");
    setBusy(true);
    setMessages((prev) => [
      ...prev,
      { id: uid(), role: "user", text, tools: [], proposals: [] },
      { id: uid(), role: "assistant", text: "", tools: [], proposals: [], streaming: true },
    ]);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch(withBasePath("/api/claude/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}));
        patchLast((m) => ({ ...m, streaming: false, error: d.error ?? t("failed") }));
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const line = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          let ev: { type: string; text?: string; tool?: string; label?: string; id?: string; message?: string };
          try {
            ev = JSON.parse(line.slice(6));
          } catch {
            continue;
          }
          if (ev.type === "text" && ev.text) patchLast((m) => ({ ...m, text: m.text ? `${m.text}\n\n${ev.text}` : ev.text! }));
          else if (ev.type === "tool" && ev.tool) patchLast((m) => ({ ...m, tools: [...m.tools, { tool: ev.tool!, label: ev.label ?? "" }] }));
          else if (ev.type === "proposal" && ev.id) patchLast((m) => ({ ...m, proposals: [...m.proposals, ev.id!] }));
          else if (ev.type === "error") patchLast((m) => ({ ...m, error: ev.message ?? t("failed") }));
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") patchLast((m) => ({ ...m, error: t("failed") }));
    } finally {
      patchLast((m) => ({ ...m, streaming: false }));
      setBusy(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  function reset() {
    abortRef.current?.abort();
    setMessages([]);
  }

  const filesChanged = () => window.dispatchEvent(new Event("cdrive:files-changed"));

  return (
    <div className="fixed inset-0 z-40 sm:inset-auto sm:bottom-3 sm:right-3 sm:top-3 sm:w-[30rem]" role="dialog" aria-modal="false" aria-label="Claude">
      <button
        type="button"
        aria-label={t("close")}
        onClick={onClose}
        className="absolute inset-0 h-full w-full sm:hidden"
        style={{ background: "rgb(8 10 14 / 0.32)" }}
      />
      <section
        className="glass-strong absolute inset-x-0 bottom-0 top-10 flex flex-col overflow-hidden rounded-t-[1.9rem] border sm:inset-0 sm:rounded-[1.9rem]"
        style={{ borderColor: "var(--glass-line)", paddingBottom: "var(--safe-bottom)" }}
      >
        <header className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <ClaudeLogo size={24} />
          <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            Claude
          </h2>
          <span className="badge">{t("beta")}</span>
          <div className="ml-auto flex items-center gap-1">
            <button type="button" className="btn-ghost" onClick={reset} disabled={messages.length === 0} title={t("newChat")}>
              {t("newChat")}
            </button>
            <button type="button" className="btn-ghost" onClick={onClose} aria-label={t("close")}>
              ✕
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {configured === false && (
            <p className="rounded-2xl p-3 text-sm" style={{ background: "var(--surface-muted)", color: "var(--text-secondary)" }}>
              {t("notConfigured")}
            </p>
          )}
          {configured && messages.length === 0 && (
            <div className="space-y-2 pt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
              <p>{t("intro")}</p>
              <ul className="space-y-1.5">
                {[t("example1"), t("example2"), t("example3")].map((ex) => (
                  <li key={ex}>
                    <button
                      type="button"
                      className="w-full rounded-xl px-3 py-2 text-left text-sm"
                      style={{ background: "var(--surface-muted)", color: "var(--text-primary)" }}
                      onClick={() => setInput(ex)}
                    >
                      {ex}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div className={m.role === "user" ? "max-w-[85%]" : "w-full"}>
                {m.role === "user" ? (
                  <div className="rounded-2xl rounded-br-md px-3.5 py-2 text-sm" style={{ background: "var(--accent)", color: "var(--accent-foreground)", whiteSpace: "pre-wrap" }}>
                    {m.text}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {m.tools.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {m.tools.map((tl, i) => (
                          <span key={i} className="badge">
                            {t(`tool.${tl.tool}`)}
                            {tl.label ? `: ${tl.label}` : ""}
                          </span>
                        ))}
                      </div>
                    )}
                    {m.text && (
                      <div className="rounded-2xl rounded-bl-md px-3.5 py-2 text-sm" style={{ background: "var(--surface-muted)", color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>
                        <RichText text={m.text} />
                      </div>
                    )}
                    {m.streaming && !m.text && (
                      <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                        {t("thinking")}
                      </div>
                    )}
                    {m.proposals.map((pid) => (
                      <ProposalCard key={pid} id={pid} onApplied={filesChanged} />
                    ))}
                    {m.error && (
                      <div className="rounded-xl px-3 py-2 text-xs" style={{ background: "var(--surface-muted)", color: "var(--danger)" }}>
                        {m.error}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <form
          className="flex items-end gap-2 p-3"
          style={{ borderTop: "1px solid var(--border)" }}
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <textarea
            className="input !rounded-2xl"
            rows={1}
            style={{ resize: "none", maxHeight: "8rem" }}
            placeholder={t("placeholder")}
            value={input}
            maxLength={4000}
            disabled={configured === false}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          {busy ? (
            <button type="button" className="btn-secondary" onClick={stop}>
              {t("stop")}
            </button>
          ) : (
            <button type="submit" className="btn-primary" disabled={!input.trim() || configured === false}>
              {t("send")}
            </button>
          )}
        </form>
      </section>
    </div>
  );
}
