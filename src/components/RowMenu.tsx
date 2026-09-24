"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type RowMenuItem = { label: string; onClick: () => void; danger?: boolean };

const VIEWPORT_MARGIN = 8;

/**
 * Satır aksiyonlarını "⋯" menüsüne toplar. Menü içeriği, `overflow-hidden` içeren üst
 * elemanlar (kart listesi) tarafından kırpılmasın diye document.body'ye portal'lanır ve
 * tetikleyici butona göre sabit (fixed) konumlandırılır.
 *
 * - Ekranın altına sığmıyorsa butonun ÜSTÜNE açılır; o da sığmazsa kaydırılabilir olur.
 * - Esc ile kapanır, odak tetikleyiciye döner; ok tuşlarıyla öğeler arasında gezilir.
 * - Tehlikeli (danger) öğeler bir ayraçla diğerlerinden ayrılır.
 */
export default function RowMenu({ items }: { items: RowMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number; maxHeight?: number }>({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? []);
      if (buttons.length === 0) return;
      e.preventDefault();
      const idx = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = e.key === "ArrowDown" ? (idx + 1) % buttons.length : (idx - 1 + buttons.length) % buttons.length;
      buttons[next].focus();
    }
    // Sayfa kayarsa fixed menü tetikleyiciden kopmasın.
    function onScroll() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  // Menü çizildikten sonra gerçek yüksekliğine göre alta mı üste mi açılacağına karar ver.
  useLayoutEffect(() => {
    if (!open || !menuRef.current || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const height = menuRef.current.scrollHeight;
    const right = window.innerWidth - rect.right;
    const below = window.innerHeight - rect.bottom - VIEWPORT_MARGIN;
    const above = rect.top - VIEWPORT_MARGIN;
    if (height + 4 <= below || below >= above) {
      setPos({ top: rect.bottom + 4, right, maxHeight: height + 4 <= below ? undefined : below - 4 });
    } else {
      const h = Math.min(height, above - 4);
      setPos({ top: rect.top - 4 - h, right, maxHeight: height <= above - 4 ? undefined : h });
    }
    menuRef.current.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
  }, [open]);

  function toggle() {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setOpen((o) => !o);
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        className="btn-ghost shrink-0 px-2"
        aria-label="Daha fazla işlem"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        ⋯
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="fixed z-50 w-52 overflow-y-auto rounded-lg border py-1 shadow-lg"
            style={{
              top: pos.top,
              right: pos.right,
              maxHeight: pos.maxHeight,
              background: "var(--surface)",
              borderColor: "var(--border)",
            }}
          >
            {items.map((item, i) => (
              <div key={i}>
                {item.danger && i > 0 && !items[i - 1].danger && (
                  <div className="my-1 border-t" style={{ borderColor: "var(--border)" }} role="separator" />
                )}
                <button
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    item.onClick();
                  }}
                  className="block w-full px-3 py-2 text-left text-sm outline-none hover:opacity-80 focus-visible:bg-[var(--surface-hover)]"
                  style={{ color: item.danger ? "var(--danger)" : "var(--text-primary)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {item.label}
                </button>
              </div>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
