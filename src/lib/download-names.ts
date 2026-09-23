/**
 * İndirme yanıtlarında kullanılan dosya adı yardımcıları.
 *
 * Dosya/klasör adları kullanıcı girdisidir ve `/`, `\`, `..` içerebilir (ad
 * doğrulaması yalnız uzunluk kontrol ediyor, ZIP yükleme de `..` klasörü
 * oluşturabiliyordu). Bu adlar ZIP arşivine olduğu gibi yazılırsa, arşivi açan
 * kişinin bilgisayarında hedef dizinin DIŞINA dosya yazılabilir ("zip slip").
 */

/** Tek bir yol parçasını ZIP girdisi için güvenli hale getirir. */
export function safeZipSegment(name: string): string {
  const cleaned = name.replace(/[\\/\u0000-\u001f]/g, "_").trim();
  if (cleaned === "" || cleaned === "." || cleaned === "..") return "_";
  return cleaned;
}

/**
 * Aynı arşiv içinde çakışan yolları "ad (2).ext" biçiminde ayırır (aynı klasörde
 * aynı adlı iki dosya, ya da temizleme sonrası eşitlenen adlar).
 */
export function dedupeZipPath(path: string, used: Set<string>): string {
  let candidate = path;
  if (used.has(candidate.toLowerCase())) {
    const slash = path.lastIndexOf("/");
    const dir = path.slice(0, slash + 1);
    const file = path.slice(slash + 1);
    const dot = file.lastIndexOf(".");
    const [stem, ext] = dot > 0 ? [file.slice(0, dot), file.slice(dot)] : [file, ""];
    for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${dir}${stem} (${n})${ext}`;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

/**
 * RFC 6266 / 5987 uyumlu Content-Disposition: eski istemciler için ASCII
 * `filename=`, modern tarayıcılar için UTF-8 `filename*=` (Türkçe karakterler
 * artık "%C3%A7" gibi bozuk görünmez).
 */
export function contentDisposition(kind: "attachment" | "inline", fileName: string): string {
  const ascii = fileName.normalize("NFKD").replace(/[^\x20-\x7e]/g, "").replace(/["\\]/g, "_").trim() || "dosya";
  const encoded = encodeURIComponent(fileName).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/** Content-Disposition başlığından dosya adını okur (önce `filename*`, sonra `filename`). */
export function fileNameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      /* bozuk kodlama — düz filename'e düş */
    }
  }
  const plain = /filename="([^"]*)"/i.exec(header);
  return plain ? plain[1] : null;
}
