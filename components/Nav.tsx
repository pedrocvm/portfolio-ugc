'use client';

import { useEffect, useRef, useState } from 'react';
import { NAV_LINKS, WHATSAPP } from '@/lib/site';

export default function Nav() {
  const [open, setOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const scenes = Array.from(document.querySelectorAll<HTMLElement>('.scene'));
    const links = NAV_LINKS.map((l) => ({
      el: nav.querySelector<HTMLAnchorElement>(`a[href="${l.href}"]`),
      sec: document.querySelector<HTMLElement>(l.href),
    }));

    function sceneAt(y: number) {
      let pick = scenes[0];
      for (const s of scenes) {
        const r = s.getBoundingClientRect();
        if (r.top <= y && r.bottom > y) return s;
        if (r.top <= y) pick = s;
      }
      return pick;
    }

    function upd() {
      if (!nav) return;
      nav.classList.toggle('on', window.scrollY > window.innerHeight * 0.8);
      const scene = sceneAt(34);
      if (scene) nav.dataset.mode = scene.dataset.mode ?? 'light';
      let cur: (typeof links)[number] | null = null;
      for (const it of links) {
        if (
          it.sec &&
          it.sec.getBoundingClientRect().top <= window.innerHeight * 0.4
        )
          cur = it;
      }
      for (const it of links) it.el?.classList.toggle('cur', it === cur);
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
      <nav id="nav" ref={navRef} aria-label="Navegação principal">
        <a className="brand mono" href="#hero">
          Carol Queiroz
        </a>
        <ul className="links">
          {NAV_LINKS.map((l) => (
            <li key={l.href}>
              <a className="mono" href={l.href}>
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        <a
          className="navCta mono"
          href={WHATSAPP}
          target="_blank"
          rel="noopener"
        >
          Pedir vídeo
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
      >
        {NAV_LINKS.map((l) => (
          <a key={l.href} href={l.href} onClick={() => setOpen(false)}>
            {l.label}
          </a>
        ))}
        <a
          className="pcta"
          href={WHATSAPP}
          target="_blank"
          rel="noopener"
          onClick={() => setOpen(false)}
        >
          Pedir vídeo →
        </a>
      </div>
    </>
  );
}
