/** Uygulama genelinde tekrar kullanılan minik alt bilgi çubuğu — marka/telif satırı. */
export default function Footer() {
  return (
    <footer
      className="shrink-0 border-t px-4 py-3 text-center text-xs"
      style={{ borderColor: "var(--border)", color: "var(--text-tertiary)" }}
    >
      © {new Date().getFullYear()} MACBYMAC — Tüm Hakları Saklıdır
    </footer>
  );
}
