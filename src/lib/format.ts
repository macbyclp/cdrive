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
  return "📁";
}
