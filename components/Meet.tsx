'use client';

import { useEffect, useRef, useState } from 'react';
import { IMAGES, NICHES, TAKES } from '@/lib/site';
import { useReel } from './useReel';

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
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    };
  }, [niche, page, update]);

  function close() {
    setNiche(null);
    opener.current?.focus();
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
          <img src={TAKES[0].img} alt="" />
          <i className="ov" />
        </div>
        <div className="wrap">
          <div className="grid">
            <figure className="shot">
              <div className="fm main">
                <img src={IMAGES.meetMain} alt="Retrato de Carol Queiroz" />
              </div>
              <div className="fm sub">
                <img src={IMAGES.meetSub} alt="" aria-hidden="true" />
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
                      <span className="qt">Ver vídeos</span>
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

      <div id="shelf" className={niche ? 'on' : undefined} aria-hidden={!niche}>
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
              const src =
                TAKES[(i + (niche?.length ?? 0)) % TAKES.length].img;
              return (
                <li key={i}>
                  <img src={src} alt="" />
                  <span className="idx mono">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="play" aria-hidden="true" />
                  <span className="cap mono">Em breve</span>
                </li>
              );
            })}
          </ul>
          <p className="foot mono">
            <span>Vídeos ilustrativos · a substituir pelos trabalhos reais</span>
            <span>{String(PER_NICHE).padStart(2, '0')} vídeos</span>
          </p>
        </div>
      </div>
    </>
  );
}
