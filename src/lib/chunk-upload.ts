// Tarayıcı tarafı parçalı yükleme: büyük dosyalar (video/foto/arşiv) 8 MB'lık parçalara bölünüp 3 paralel istekle gönderilir.
// Her parça ağ hatasında/5xx'te yeniden denenir; tüm parçalar gidince sunucuda birleştirme + kayıt (veya zip çıkarma) yapılır.
// Dosya belleğe alınmaz (File.slice() tembeldir): GB'larca dosya tarayıcıda da sabit bellekle yüklenir.

import { withBasePath } from "@/lib/basePath";
import type { XhrUploadResult } from "@/lib/upload-xhr";

/** Bu boyuttan büyük dosyalar parçalı yüklenir (küçükler tek istekle). */
export const CHUNKED_THRESHOLD = 8 * 1024 * 1024;
const CONCURRENCY = 3;
const MAX_RETRIES = 4;

type Init = { id: string; chunkSize: number; chunkCount: number };

function sendChunk(url: string, blob: Blob, onBytes: (loaded: number) => void, register: (x: XMLHttpRequest) => void): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    register(xhr);
    xhr.open("PUT", url);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onBytes(e.loaded);
    };
    xhr.onload = () => {
      let data: unknown = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* JSON değil */
      }
      resolve({ status: xhr.status, data });
    };
    xhr.onerror = () => resolve({ status: 0, data: { error: "Ağ hatası" } });
    xhr.onabort = () => resolve({ status: -1, data: { error: "İptal edildi" } });
    xhr.ontimeout = () => resolve({ status: 0, data: { error: "Zaman aşımı" } });
    xhr.send(blob);
  });
}

export function chunkedUpload(opts: {
  file: File;
  folderId: string | null;
  /** true: dosya .zip ve sunucuda hedef klasöre çıkarılır (zip'in kendisi saklanmaz). */
  extract?: boolean;
  onProgress: (loaded: number) => void;
  /** Tüm parçalar gönderildi; sunucu birleştirip kaydediyor. */
  onSent?: () => void;
}): { promise: Promise<XhrUploadResult>; abort: () => void } {
  const { file } = opts;
  let aborted = false;
  const active = new Set<XMLHttpRequest>();
  let sessionId: string | null = null;

  const fail = (status: number, error: string): XhrUploadResult => ({ ok: false, status, data: { error } });

  const run = async (): Promise<XhrUploadResult> => {
    // 1) başlat: yetki/kota/politika/disk BAŞTA denetlenir
    let init: Init;
    try {
      const res = await fetch(withBasePath("/api/uploads"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, mimeType: file.type || undefined, folderId: opts.folderId, extract: !!opts.extract }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, status: res.status, data };
      init = data as Init;
    } catch {
      return fail(0, "Ağ hatası");
    }
    sessionId = init.id;
    if (aborted) {
      void fetch(withBasePath(`/api/uploads/${init.id}`), { method: "DELETE" }).catch(() => {});
      return fail(0, "İptal edildi");
    }

    // 2) parçalar: 3 paralel, her biri yeniden denenebilir
    const perChunk = new Array<number>(init.chunkCount).fill(0);
    const report = () => opts.onProgress(perChunk.reduce((a, b) => a + b, 0));
    let next = 0;
    let failure: XhrUploadResult | null = null;

    const worker = async () => {
      for (;;) {
        if (aborted || failure) return;
        const index = next++;
        if (index >= init.chunkCount) return;
        const start = index * init.chunkSize;
        const blob = file.slice(start, Math.min(file.size, start + init.chunkSize));
        let attempt = 0;
        for (;;) {
          perChunk[index] = 0;
          const r = await sendChunk(
            withBasePath(`/api/uploads/${init.id}/chunks/${index}`),
            blob,
            (loaded) => {
              perChunk[index] = loaded;
              report();
            },
            (x) => active.add(x)
          );
          if (aborted) return;
          if (r.status >= 200 && r.status < 300) {
            perChunk[index] = blob.size;
            report();
            break;
          }
          // 4xx (429 hariç) kalıcı hata: yeniden denemenin anlamı yok
          const permanent = r.status >= 400 && r.status < 500 && r.status !== 429;
          if (permanent || ++attempt > MAX_RETRIES) {
            failure = { ok: false, status: r.status, data: r.data ?? { error: "Parça yüklenemedi" } };
            return;
          }
          await new Promise((res) => setTimeout(res, 500 * 2 ** (attempt - 1)));
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, init.chunkCount) }, worker));

    if (aborted) return fail(0, "İptal edildi");
    if (failure) {
      void fetch(withBasePath(`/api/uploads/${init.id}`), { method: "DELETE" }).catch(() => {});
      return failure;
    }

    // 3) birleştir + kaydet (zip çıkarma burada, uzun sürebilir)
    opts.onSent?.();
    try {
      const res = await fetch(withBasePath(`/api/uploads/${init.id}/complete`), { method: "POST" });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, data };
    } catch {
      return fail(0, "Ağ hatası (birleştirme yanıtı alınamadı; dosya listesini yenileyin)");
    }
  };

  return {
    promise: run(),
    abort: () => {
      aborted = true;
      for (const x of active) x.abort();
      if (sessionId) void fetch(withBasePath(`/api/uploads/${sessionId}`), { method: "DELETE" }).catch(() => {});
    },
  };
}
