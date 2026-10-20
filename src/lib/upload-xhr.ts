// Tarayıcıda bayt bazlı yükleme ilerlemesi: fetch() yükleme ilerlemesini bildirmediği için XMLHttpRequest kullanılır.

export type XhrUploadResult = { ok: boolean; status: number; data: unknown };

export function xhrUpload(
  url: string,
  body: FormData,
  onProgress: (loaded: number, total: number) => void,
  onSent?: () => void
): { promise: Promise<XhrUploadResult>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<XhrUploadResult>((resolve) => {
    xhr.open("POST", url);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded, e.total);
    };
    // Gövde tamamen gönderildi; sunucu işliyor (metin çıkarma, sürümleme…) — yanıt gelene kadar "işleniyor".
    xhr.upload.onload = () => onSent?.();
    xhr.onload = () => {
      let data: unknown = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* JSON olmayan yanıt */
      }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data });
    };
    xhr.onerror = () => resolve({ ok: false, status: 0, data: { error: "Ağ hatası" } });
    xhr.onabort = () => resolve({ ok: false, status: 0, data: { error: "İptal edildi" } });
    xhr.ontimeout = () => resolve({ ok: false, status: 0, data: { error: "Zaman aşımı" } });
    xhr.send(body);
  });
  return { promise, abort: () => xhr.abort() };
}

export function errorOf(r: XhrUploadResult, fallback: string): string {
  const d = r.data as { error?: string } | null;
  return d?.error ?? fallback;
}
