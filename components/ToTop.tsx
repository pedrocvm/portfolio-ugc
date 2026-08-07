'use client';

import { useEffect, useRef } from 'react';

export default function ToTop() {
  const btn = useRef<HTMLButtonElement>(null);
  const fill = useRef<HTMLElement>(null);

  useEffect(() => {
    function upd() {
      const el = btn.current;
      const bar = fill.current;
      if (!el || !bar) return;
      el.classList.toggle('on', window.scrollY > window.innerHeight * 0.9);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, window.scrollY / max) : 0;
      bar.style.transform = `scaleY(${p})`;
    }
    upd();
    window.addEventListener('scroll', upd, { passive: true });
    window.addEventListener('resize', upd);
    return () => {
      window.removeEventListener('scroll', upd);
      window.removeEventListener('resize', upd);
    };
  }, []);

  return (
    <button
      id="toTop"
      ref={btn}
      type="button"
      aria-label="Voltar ao topo"
      onClick={() =>
        window.scrollTo({
          top: 0,
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth',
        })
      }
    >
      <span className="ln" aria-hidden="true">
        <i ref={fill} />
      </span>
      <span className="lb mono" aria-hidden="true">
        Topo
      </span>
    </button>
  );
}
