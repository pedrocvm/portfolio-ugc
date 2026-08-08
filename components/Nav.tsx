'use client';

import { useEffect, useRef, useState } from 'react';
import { NAV_HREFS, type Content } from '@/lib/content';

export default function Nav({
  c,
  whatsapp,
}: {
  c: Content['nav'];
  whatsapp: string;
}) {
  const [open, setOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const links = NAV_HREFS.map((href, i) => ({ href, label: c.labels[i] ?? '' }));

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
      document.getElementById('navBtn')?.focus();
    };
  }, [open]);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const scenes = Array.from(
      document.querySelectorAll<HTMLElement>('.scene, .chap.dark'),
    );
    const items = NAV_HREFS.map((href) => ({
      el: nav.querySelector<HTMLAnchorElement>(`a[href="${href}"]`),
      sec: document.querySelector<HTMLElement>(href),
    }));

    function sceneAt(y: number) {
      let inside = false;
      let pick = scenes[0];
      for (const s of scenes) {
        const r = s.getBoundingClientRect();
        if (r.top <= y && (r.bottom > y || !inside)) pick = s;
        if (r.top <= y && r.bottom > y) inside = true;
      }
      return pick;
    }

    function upd() {
      if (!nav) return;
      nav.classList.toggle('on', window.scrollY > window.innerHeight * 0.8);
      const scene = sceneAt(34);
      const mode = scene?.dataset.mode ?? 'light';
      if (scene) nav.dataset.mode = mode;
      const lock = document.getElementById('privLock');
      if (lock && scene) lock.dataset.mode = mode;
      let cur: (typeof items)[number] | null = null;
      for (const it of items) {
        if (
          it.sec &&
          it.sec.getBoundingClientRect().top <= window.innerHeight * 0.4
        )
          cur = it;
      }
      for (const it of items) it.el?.classList.toggle('cur', it === cur);
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
    <>
      <a
        id="privLock"
        href="/dashboard"
        aria-label="Área privada"
        data-hide={open || undefined}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M7 10V7a5 5 0 0 1 10 0v3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
          />
          <rect
            x="4.5"
            y="10"
            width="15"
            height="10.5"
            rx="2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
          />
        </svg>
      </a>

      <nav
        id="nav"
        ref={navRef}
        data-open={open}
        aria-label="Navegação principal"
      >
        <a className="brand mono" href="#hero">
          {c.brand}
        </a>
        <ul className="links">
          {links.map((l) => (
            <li key={l.href}>
              <a className="mono" href={l.href}>
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        <a
          className="navCta mono"
          href={whatsapp}
          target="_blank"
          rel="noopener"
        >
          {c.cta}
        </a>
        <button
          id="navBtn"
          className="mono"
          type="button"
          aria-expanded={open}
          aria-controls="navPanel"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Fechar' : 'Menu'}
        </button>
      </nav>

      <div
        id="navPanel"
        className={open ? 'on' : undefined}
        aria-hidden={!open}
        inert={!open}
      >
        {links.map((l) => (
          <a key={l.href} href={l.href} onClick={() => setOpen(false)}>
            {l.label}
          </a>
        ))}
        <a
          className="pcta"
          href={whatsapp}
          target="_blank"
          rel="noopener"
          onClick={() => setOpen(false)}
        >
          {c.chip}
        </a>
        <a className="ppriv" href="/dashboard" onClick={() => setOpen(false)}>
          Área privada
        </a>
      </div>
    </>
  );
}
