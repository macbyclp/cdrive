export function formatBytesStr(bytes: string | number) {
  const n = typeof bytes === "string" ? Number(bytes) : bytes;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let val = n;
  let i = 0;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(val < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export type PreviewKind = "image" | "pdf" | "text" | "none";

export function previewKind(mime: string): PreviewKind {
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  if (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/javascript" ||
    mime === "application/xml"
  ) {
    return "text";
  }
  return "none";
}

export function iconForMime(mime: string) {
  if (mime.startsWith("image/")) return "🖼️";
  if (mime.startsWith("video/")) return "🎞️";
  if (mime.startsWith("audio/")) return "🎵";
  if (mime === "application/pdf") return "📕";
  if (mime.includes("zip") || mime.includes("compressed")) return "🗜️";
  if (mime.includes("sheet") || mime.includes("excel")) return "📊";
  if (mime.includes("word") || mime.includes("document")) return "📄";
  if (mime.includes("presentation")) return "📽️";
  if (mime.startsWith("text/")) return "📝";
  return "📄";
}

/** Dosya türüne göre yumuşak, renkli bir rozet zemini — göz taraması için kategori rengi. */
export function badgeColorForMime(mime: string): string {
  if (mime.startsWith("image/")) return "#ec4899"; // pembe
  if (mime.startsWith("video/")) return "#8b5cf6"; // mor
  if (mime.startsWith("audio/")) return "#f59e0b"; // amber
  if (mime === "application/pdf") return "#ef4444"; // kırmızı
  if (mime.includes("zip") || mime.includes("compressed")) return "#f97316"; // turuncu
  if (mime.includes("sheet") || mime.includes("excel")) return "#16a34a"; // yeşil
  if (mime.includes("word") || mime.includes("document")) return "#2563eb"; // mavi
  if (mime.includes("presentation")) return "#dc2626"; // kırmızımsı
  return "#64748b"; // gri
}
