"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type RowMenuItem = { label: string; onClick: () => void; danger?: boolean };

/**
 * Dar ekranlarda satır aksiyonlarının taşmasını önlemek için "⋯" menüsüne toplar.
 * Menü içeriği, `overflow-hidden` içeren üst elemanlar (kart listesi) tarafından
 * kırpılmasın diye document.body'ye portal'lanır ve tetikleyici butona göre
 * sabit (fixed) konumlandırılır.
 */
export default function RowMenu({ items }: { items: RowMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
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
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function toggle() {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setOpen((o) => !o);
  }

  return (
    <>
      <button ref={btnRef} onClick={toggle} className="btn-ghost shrink-0 px-2" aria-label="Daha fazla işlem">
        ⋯
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-50 w-44 overflow-hidden rounded-lg border py-1 shadow-lg"
            style={{ top: pos.top, right: pos.right, background: "var(--surface)", borderColor: "var(--border)" }}
          >
            {items.map((item, i) => (
              <button
                key={i}
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
                className="block w-full px-3 py-2 text-left text-sm hover:opacity-80"
                style={{ color: item.danger ? "var(--danger)" : "var(--text-primary)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {item.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
