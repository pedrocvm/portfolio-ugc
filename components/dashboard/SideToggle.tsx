'use client';

import { useEffect, useRef } from 'react';

/* O estado vive num atributo do <html>, não em React: assim o script de
   arranque aplica-o antes da primeira pintura e a barra não abre e recolhe à
   frente dela a cada navegação. O botão só sincroniza o que anuncia. */
function sync(btn: HTMLButtonElement | null) {
  if (!btn) return;
  const off = document.documentElement.dataset.side === 'off';
  const label = off ? 'Abrir a barra lateral' : 'Recolher a barra lateral';
  btn.setAttribute('aria-expanded', String(!off));
  btn.setAttribute('aria-label', label);
  btn.title = label;
}

export default function SideToggle() {
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => sync(btn.current), []);

  function toggle() {
    const root = document.documentElement;
    const off = root.dataset.side !== 'off';
    if (off) root.dataset.side = 'off';
    else delete root.dataset.side;
    try {
      localStorage.setItem('side', off ? 'off' : 'on');
    } catch {}
    sync(btn.current);
  }

  return (
    <button
      ref={btn}
      type="button"
      className="sideToggle"
      onClick={toggle}
      aria-expanded
      aria-controls="rail"
      aria-label="Recolher a barra lateral"
      title="Recolher a barra lateral"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <rect x="3.5" y="4.5" width="17" height="15" rx="2.4" />
        <path d="M9.6 4.5v15" />
      </svg>
    </button>
  );
}
