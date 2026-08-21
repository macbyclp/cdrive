"use client";

import { useEffect, useState } from "react";
import { withBasePath } from "@/lib/basePath";

/**
 * Uygulama genelinde tekrar kullanılan minik alt bilgi çubuğu — marka/telif satırı.
 * Kurum adı admin panelinden değiştirilebildiği için (bkz. SystemSettings.orgName)
 * sabit metin yerine kimlik doğrulama gerektirmeyen /api/public/org-name'den çekiliyor —
 * bu bileşen hem giriş yapılmış hem /login gibi anonim sayfalarda render ediliyor.
 */
export default function Footer() {
  const [orgName, setOrgName] = useState("MACBYMAC");

  useEffect(() => {
    fetch(withBasePath("/api/public/org-name"))
      .then((r) => r.json())
      .then((d) => {
        if (d.orgName) setOrgName(d.orgName);
      })
      .catch(() => {});
  }, []);

  return (
    <footer
      className="shrink-0 border-t px-4 py-3 text-center text-xs"
      style={{ borderColor: "var(--border)", color: "var(--text-tertiary)" }}
    >
      © {new Date().getFullYear()} {orgName} — Tüm Hakları Saklıdır
    </footer>
  );
}
