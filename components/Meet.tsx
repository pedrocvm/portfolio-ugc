'use client';

import { useEffect, useRef, useState } from 'react';
import { IMAGES, NICHES, PHOTOS, TAKES } from '@/lib/site';
import { useReel } from './useReel';
import Pic from './Pic';

const POOL = [...TAKES.map((t) => t.img), ...PHOTOS];
const PER_NICHE = 8;

export default function Meet() {
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
          <Pic src={TAKES[0].img} alt="" />
          <i className="ov" />
        </div>
        <div className="wrap">
          <div className="grid">
            <figure className="shot">
              <div className="fm main">
                <Pic src={IMAGES.meetMain} alt="Retrato de Carol Queiroz" />
              </div>
              <div className="fm sub">
                <Pic src={IMAGES.meetSub} alt="" ariaHidden />
              </div>
            </figure>
            <div className="txt">
              <p className="mono eyebrow">Antes da sessão</p>
              <h2 className="disp">
                Prazer, <em className="serif-it">Carol.</em>
              </h2>
              <p className="bio">
                Falo para a câmera como falo com quem conheço. Gravo, escrevo e
                edito os meus próprios vídeos, em português, para marcas que
                querem ver o produto na vida real antes de o vender.
              </p>
              <ul className="nichos">
                {NICHES.map((n) => (
                  <li key={n}>
                    <button
                      type="button"
                      onClick={(e) => {
                        opener.current = e.currentTarget;
                        setNiche(n);
                      }}
                    >
                      <span>{n}</span>
                      <span className="qt">Ver registos</span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="nota">
                “No vídeo do sérum decidi abrir com a textura no dorso da mão,
                porque é o que eu verificaria antes de comprar.”
              </p>
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
              <p className="mono eyebrow">Nicho</p>
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
            {Array.from({ length: PER_NICHE }, (_, i) => {
              const off = NICHES.indexOf(niche ?? '');
              const src = POOL[(i + (off < 0 ? 0 : off * 3)) % POOL.length];
              return (
                <li key={i}>
                  <Pic src={src} alt="" />
                  <span className="idx mono">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="foot mono">
            <span>Sessões próprias</span>
            <span>{String(PER_NICHE).padStart(2, '0')} registos</span>
          </p>
        </div>
      </div>
    </>
  );
}
