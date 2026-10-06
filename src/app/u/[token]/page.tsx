"use client";

import { use, useEffect, useRef, useState } from "react";
import { formatBytesStr } from "@/lib/format";
import { withBasePath } from "@/lib/basePath";
import Footer from "@/components/Footer";

type Info = {
  title: string;
  message: string | null;
  requiresPassword: boolean;
  expiresAt: string;
  remaining: number;
  maxFileBytes: number;
  orgName: string;
};

type Item = { id: number; name: string; size: number; state: "waiting" | "uploading" | "done" | "error"; progress: number; error?: string };

/** Herkese açık "dosya isteği" sayfası — hesap gerekmez; yalnızca yükleme yapılır, hiçbir şey listelenmez/indirilmez. */
export default function UploadRequestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [drag, setDrag] = useState(false);
  const nextId = useRef(1);
  const busy = useRef(false);
  const queue = useRef<{ id: number; file: File }[]>([]);
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    fetch(withBasePath(`/api/upload-request/${token}/info`))
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Bağlantı bulunamadı");
        setInfo(d);
        setRemaining(d.remaining);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Bir hata oluştu"));
  }, [token]);

  const patch = (id: number, p: Partial<Item>) => setItems((list) => list.map((it) => (it.id === id ? { ...it, ...p } : it)));

  function uploadOne(id: number, file: File) {
    return new Promise<void>((resolve) => {
      const fd = new FormData();
      fd.append("file", file);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", withBasePath(`/api/upload-request/${token}`));
      if (password) xhr.setRequestHeader("x-upload-password", password);
      xhr.upload.onprogress = (e) => e.lengthComputable && patch(id, { progress: Math.round((e.loaded / e.total) * 100) });
      xhr.onload = () => {
        let d: { error?: string } = {};
        try {
          d = JSON.parse(xhr.responseText);
        } catch {
          /* gövde JSON değil */
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          patch(id, { state: "done", progress: 100 });
          setRemaining((n) => (n === null ? n : Math.max(0, n - 1)));
        } else {
          patch(id, { state: "error", error: d.error ?? `Yüklenemedi (${xhr.status})` });
        }
        resolve();
      };
      xhr.onerror = () => {
        patch(id, { state: "error", error: "Bağlantı hatası" });
        resolve();
      };
      xhr.send(fd);
    });
  }

  async function pump() {
    if (busy.current) return;
    busy.current = true;
    while (queue.current.length) {
      const next = queue.current.shift()!;
      patch(next.id, { state: "uploading" });
      await uploadOne(next.id, next.file);
    }
    busy.current = false;
  }

  function addFiles(list: FileList | File[]) {
    if (!info) return;
    const added: Item[] = [];
    for (const file of Array.from(list)) {
      const id = nextId.current++;
      if (file.size === 0) added.push({ id, name: file.name, size: 0, state: "error", progress: 0, error: "Boş dosya" });
      else if (file.size > info.maxFileBytes)
        added.push({ id, name: file.name, size: file.size, state: "error", progress: 0, error: `En çok ${formatBytesStr(info.maxFileBytes)} yüklenebilir` });
      else {
        added.push({ id, name: file.name, size: file.size, state: "waiting", progress: 0 });
        queue.current.push({ id, file });
      }
    }
    setItems((l) => [...l, ...added]);
    void pump();
  }

  const closed = remaining === 0;
  const needsPassword = info?.requiresPassword && !password;

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-lg rounded-[1.75rem] border p-8 shadow-sm" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          {error ? (
            <div className="text-center">
              <h1 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                Bağlantı kullanılamıyor
              </h1>
              <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                {error}
              </p>
            </div>
          ) : !info ? (
            <div className="skeleton h-24 w-full" />
          ) : (
            <>
              <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
                {info.title}
              </h1>
              {info.message && (
                <p className="mt-2 whitespace-pre-wrap text-sm" style={{ color: "var(--text-secondary)" }}>
                  {info.message}
                </p>
              )}
              <p className="mt-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
                {info.orgName} adına dosya yüklüyorsunuz · {new Date(info.expiresAt).toLocaleDateString("tr-TR")} tarihine kadar geçerli · en çok{" "}
                {formatBytesStr(info.maxFileBytes)} / dosya · {remaining} dosya hakkı kaldı
              </p>

              {info.requiresPassword && (
                <input
                  type="password"
                  autoComplete="off"
                  className="input mt-4"
                  placeholder="Şifre"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              )}

              {closed ? (
                <p className="mt-6 rounded-xl border p-4 text-center text-sm" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
                  Bu istek için dosya sayısı sınırına ulaşıldı.
                </p>
              ) : (
                <label
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDrag(true);
                  }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDrag(false);
                    if (!needsPassword) addFiles(e.dataTransfer.files);
                  }}
                  className="mt-4 flex cursor-pointer flex-col items-center gap-1 rounded-2xl border-2 border-dashed px-4 py-10 text-center"
                  style={{
                    borderColor: drag ? "var(--accent)" : "var(--border)",
                    background: drag ? "var(--accent-soft)" : "transparent",
                    opacity: needsPassword ? 0.5 : 1,
                  }}
                >
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    Dosyaları buraya bırakın ya da seçmek için tıklayın
                  </span>
                  <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                    {needsPassword ? "Önce şifreyi girin" : "Birden fazla dosya seçebilirsiniz"}
                  </span>
                  <input
                    type="file"
                    multiple
                    disabled={!!needsPassword}
                    className="sr-only"
                    onChange={(e) => {
                      if (e.target.files) addFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}

              {items.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {items.map((it) => (
                    <li key={it.id} className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--border)" }}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate" style={{ color: "var(--text-primary)" }}>
                          {it.name}
                        </span>
                        <span className="shrink-0 text-xs" style={{ color: it.state === "error" ? "#dc2626" : "var(--text-secondary)" }}>
                          {it.state === "done" ? "✓ Yüklendi" : it.state === "error" ? it.error : it.state === "uploading" ? `%${it.progress}` : "Sırada"}
                        </span>
                      </div>
                      {it.state === "uploading" && (
                        <div className="mt-1.5 h-1 overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
                          <div className="h-full" style={{ width: `${it.progress}%`, background: "var(--accent)" }} />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
