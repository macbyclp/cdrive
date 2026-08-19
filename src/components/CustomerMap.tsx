"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

type MapPoint = { id: string; name: string; address: string | null; lat: number; lng: number };

/**
 * Panel'deki "Genel Görünüm" kartı için gerçek harita — OpenStreetMap tile'ları
 * (ücretsiz, API anahtarı gerekmez) + Leaflet.js. Sadece daha önce geocode edilmiş
 * (bkz. src/lib/geocode.ts) müşterileri gösterir; hiç yoksa çağıran taraf dekoratif
 * duruma düşer (bkz. panel/page.tsx).
 */
export default function CustomerMap({ points }: { points: MapPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || points.length === 0) return;
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;

      // Varsayılan Leaflet marker ikonları bundler'lar altında kırık gelir (göreli
      // asset yolları) — CSS ile çizilen basit bir daire ikonuna geçiliyor.
      const dotIcon = L.divIcon({
        className: "",
        html: '<div style="width:14px;height:14px;border-radius:9999px;background:#4f46e5;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });

      const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true });
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      const markers = points.map((p) =>
        L.marker([p.lat, p.lng], { icon: dotIcon }).bindPopup(`<b>${escapeHtml(p.name)}</b>${p.address ? `<br>${escapeHtml(p.address)}` : ""}`)
      );
      const group = L.featureGroup(markers).addTo(map);

      if (points.length === 1) {
        map.setView([points[0].lat, points[0].lng], 13);
      } else {
        map.fitBounds(group.getBounds().pad(0.2));
      }
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [points]);

  if (points.length === 0) return null;

  return <div ref={containerRef} className="h-56 w-full" />;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
