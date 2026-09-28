"use client";

import { useEffect } from "react";

/**
 * Liquid Glass etkileşimleri — tek bir global dinleyiciyle (olay delegasyonu), bileşen
 * başına ek maliyet olmadan:
 *  - Fare hedefin üstündeyken --mx/--my yazılır ve data-lg-hover işaretlenir; globals.css
 *    bu durumda ::after katmanında ışık lekesi + halka çizer, aşağıdaki SVG filtresi
 *    (#cd-water) halkaları su gibi dalgalandırır.
 *  - Tıklama/dokunmada hedefe kırpılmış geçici bir dalga (ripple) katmanı çıkar.
 * "Hareketi azalt" ayarında veya eski görünümlerde (modern/archive) hiçbir şey yapmaz.
 * Dokunmatik cihazlarda hover olmadığından yalnız ripple çalışır.
 */
const TARGET =
  ".card, .btn-primary, .btn-secondary, .btn-ghost, .lg-nav-link, .lg-tab, .glass, [data-liquid]";
// Çok büyük yüzeylerde (tüm sayfa kartı) hover filtresi/dalga anlamsız ve pahalı.
const MAX_AREA = 260_000;

export default function LiquidEffects() {
  useEffect(() => {
    // Hareket tercihi <html data-motion> ile yönetilir (theme init script'i + Hesap Ayarları'ndaki anahtar).
    const motionOn = () => document.documentElement.getAttribute("data-motion") !== "off";

    let current: HTMLElement | null = null;
    let raf = 0;
    let pending: PointerEvent | null = null;
    let wobbleRaf = 0;
    let lastWobble = 0;
    const turb = document.getElementById("cd-turb");

    const isLegacy = (el: Element) => !!el.closest('[data-skin="modern"], [data-skin="archive"]');

    function eligible(el: HTMLElement | null): HTMLElement | null {
      if (!el || (el as HTMLButtonElement).disabled || isLegacy(el)) return null;
      const r = el.getBoundingClientRect();
      if (r.width * r.height > MAX_AREA) return null;
      return el;
    }

    function setCurrent(next: HTMLElement | null) {
      if (next === current) return;
      current?.removeAttribute("data-lg-hover");
      current = next;
      if (current) {
        current.classList.add("lg-live");
        current.setAttribute("data-lg-hover", "");
        startWobble();
      }
    }

    function startWobble() {
      if (wobbleRaf || !turb) return;
      const tick = (t: number) => {
        if (!current) {
          wobbleRaf = 0;
          return;
        }
        if (t - lastWobble > 33) {
          lastWobble = t;
          const fx = 0.011 + 0.004 * Math.sin(t / 1300);
          const fy = 0.017 + 0.004 * Math.cos(t / 1700);
          turb.setAttribute("baseFrequency", `${fx.toFixed(4)} ${fy.toFixed(4)}`);
        }
        wobbleRaf = requestAnimationFrame(tick);
      };
      wobbleRaf = requestAnimationFrame(tick);
    }

    function onMove(e: PointerEvent) {
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      if (!motionOn()) {
        if (current) setCurrent(null);
        return;
      }
      pending = e;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const ev = pending;
        pending = null;
        if (!ev) return;
        const hit = (ev.target as Element | null)?.closest?.(TARGET) as HTMLElement | null;
        const target = eligible(hit);
        setCurrent(target);
        if (target) {
          const r = target.getBoundingClientRect();
          target.style.setProperty("--mx", `${ev.clientX - r.left}px`);
          target.style.setProperty("--my", `${ev.clientY - r.top}px`);
        }
      });
    }

    function onLeaveDoc() {
      setCurrent(null);
    }

    function onDown(e: PointerEvent) {
      if (!motionOn()) return;
      if (e.button !== 0 && e.pointerType === "mouse") return;
      const hit = (e.target as Element | null)?.closest?.(TARGET) as HTMLElement | null;
      const target = eligible(hit);
      if (!target) return;
      const r = target.getBoundingClientRect();
      const layer = document.createElement("div");
      layer.className = "lg-ripple-layer";
      layer.style.left = `${r.left}px`;
      layer.style.top = `${r.top}px`;
      layer.style.width = `${r.width}px`;
      layer.style.height = `${r.height}px`;
      layer.style.borderRadius = getComputedStyle(target).borderRadius;
      const size = Math.max(r.width, r.height) * 2.4;
      const dot = document.createElement("span");
      dot.className = "lg-ripple";
      dot.style.left = `${e.clientX - r.left}px`;
      dot.style.top = `${e.clientY - r.top}px`;
      dot.style.width = `${size}px`;
      dot.style.height = `${size}px`;
      layer.appendChild(dot);
      document.body.appendChild(layer);
      window.setTimeout(() => layer.remove(), 800);
    }

    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerdown", onDown, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeaveDoc);
    window.addEventListener("blur", onLeaveDoc);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerdown", onDown);
      document.documentElement.removeEventListener("pointerleave", onLeaveDoc);
      window.removeEventListener("blur", onLeaveDoc);
      if (raf) cancelAnimationFrame(raf);
      if (wobbleRaf) cancelAnimationFrame(wobbleRaf);
      setCurrent(null);
    };
  }, []);

  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: "absolute" }}>
      <defs>
        {/* Su dalgası: fractal gürültü ile yer değiştirme; baseFrequency LiquidEffects'te
            hover sürerken hafifçe salınır. */}
        <filter id="cd-water" x="-8%" y="-8%" width="116%" height="116%" colorInterpolationFilters="sRGB">
          <feTurbulence id="cd-turb" type="fractalNoise" baseFrequency="0.011 0.017" numOctaves="2" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="18" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    </svg>
  );
}
