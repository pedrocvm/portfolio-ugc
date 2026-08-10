'use client';

import { useEffect, useRef, useState } from 'react';
import type { Content } from '@/lib/content';
import { useReel } from './useReel';
import { isVideo } from '@/lib/media';
import Pic from './Pic';

const PER_NICHE = 8;

export default function Meet({
  c,
  pool,
}: {
  c: Content['meet'];
  pool: string[];
}) {
  const [niche, setNiche] = useState<string | null>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const { reelRef, atStart, atEnd, page, update } = useReel();

  useEffect(() => {
    if (!niche) return;
    document.body.style.overflow = 'hidden';
    sheet.current?.focus();
    update();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setNiche(null);
      if (e.key === 'ArrowRight') page(1);
      if (e.key === 'ArrowLeft') page(-1);
      if (e.key !== 'Tab') return;
      const f = sheet.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled])',
      );
      if (!f?.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      const at = document.activeElement;
      if (e.shiftKey && (at === first || at === sheet.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && at === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
      opener.current?.focus();
    };
  }, [niche, page, update]);

  function close() {
    setNiche(null);
  }

  /* os registos do nicho vêm da biblioteca; enquanto ela não os escolher, a
     gaveta continua a mostrar uma seleção automática das fotos do site */
  const chosen = c.niches.find((n) => n.name === niche);
  const shelf = chosen?.reel.length
    ? chosen.reel.map((r) => r.src).filter(Boolean)
    : pool.length
      ? Array.from({ length: PER_NICHE }, (_, i) => {
          const off = c.niches.findIndex((n) => n.name === niche);
          return pool[(i + (off < 0 ? 0 : off * 3)) % pool.length];
        })
      : [];

  return (
    <>
      <section
        id="meet"
        className="scene on-light"
        data-bg="#f7f3ee"
        data-mode="light"
        aria-label="Apresentação"
      >
        <div className="bgimg" data-par="" aria-hidden="true">
          {pool[0] ? <Pic src={pool[0]} alt="" /> : null}
          <i className="ov" />
        </div>
        <div className="wrap">
          <div className="grid">
            <figure className="shot">
              <div className="fm main">
                <Pic src={c.imageMain} alt={c.imageMainAlt} />
              </div>
            </figure>
            <div className="txt">
              <p className="mono eyebrow">{c.eyebrow}</p>
              <h2 className="disp">
                {c.titleLead} <em className="serif-it">{c.titleEm}</em>
              </h2>
              <p className="bio">{c.bio}</p>
              <ul className="nichos">
                {c.niches.map((n) => (
                  <li key={n.name}>
                    <button
                      type="button"
                      onClick={(e) => {
                        opener.current = e.currentTarget;
                        setNiche(n.name);
                      }}
                    >
                      <span>{n.name}</span>
                      <span className="qt">Ver registos</span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="nota">{c.note}</p>
            </div>
          </div>
        </div>
      </section>

      <div
        id="shelf"
        className={niche ? 'on' : undefined}
        aria-hidden={!niche}
        inert={!niche}
      >
        <div className="scrim" onClick={close} />
        <div
          className="sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="shelfTitle"
          tabIndex={-1}
          ref={sheet}
        >
          <div className="head">
            <div>
              <p className="mono eyebrow">{c.shelfEyebrow}</p>
              <h2 id="shelfTitle">{niche ?? ''}</h2>
            </div>
            <div className="ctrls">
              <button
                className="rnd prev"
                type="button"
                aria-label="Anterior"
                disabled={atStart}
                onClick={() => page(-1)}
              >
                ←
              </button>
              <button
                className="rnd next"
                type="button"
                aria-label="Seguinte"
                disabled={atEnd}
                onClick={() => page(1)}
              >
                →
              </button>
              <button
                className="rnd close"
                type="button"
                aria-label="Fechar"
                onClick={close}
              >
                ✕
              </button>
            </div>
          </div>
          <ul className="reel" ref={reelRef}>
            {shelf.map((src, i) => (
              <li key={i}>
                {isVideo(src) ? (
                  <video src={src} muted loop playsInline preload="metadata" />
                ) : (
                  <Pic src={src} alt="" />
                )}
                <span className="idx mono">
                  {String(i + 1).padStart(2, '0')}
                </span>
              </li>
            ))}
          </ul>
          <p className="foot mono">
            <span>{c.shelfFoot}</span>
            <span>{String(shelf.length).padStart(2, '0')} registos</span>
          </p>
        </div>
      </div>
    </>
  );
}
