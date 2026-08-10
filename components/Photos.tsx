'use client';

import { useCallback, useState } from 'react';
import type { Content } from '@/lib/content';
import { useReel } from './useReel';
import Lightbox from './Lightbox';
import Pic from './Pic';

const nome = (i: number) => `Foto UGC ${String(i + 1).padStart(2, '0')}`;
const POR_PAGINA = 9;

export default function Photos({ c }: { c: Content['photos'] }) {
  const { reelRef, atStart, atEnd, page } = useReel();
  const [aberta, setAberta] = useState<number | null>(null);
  /* identidade estável: sem isto o efeito do visor corre a cada render e
     perde o botão a que tem de devolver o foco */
  const fechar = useCallback(() => setAberta(null), []);
  /* uma passagem lateral vale uma grelha inteira de 3x3 */
  const pages = Array.from(
    { length: Math.ceil(c.items.length / POR_PAGINA) },
    (_, p) => p * POR_PAGINA,
  );

  return (
    <section id="fotos" className="chap" aria-label="Fotos UGC">
      <div className="wrap">
        <div className="chapHead">
          <span className="mono cn">{c.num}</span>
          <span className="mono eyebrow">{c.eyebrow}</span>
          <i />
        </div>
        <div className="reelHead">
          <h2 className="disp">
            {c.titleLead} <em className="serif-it">{c.titleEm}</em>
          </h2>
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
          </div>
        </div>
        <ul className="pgrid" id="fotosReel" ref={reelRef}>
          {pages.map((first) => (
            <li key={first}>
              {c.items.slice(first, first + POR_PAGINA).map((p, k) => {
                const i = first + k;
                return (
                  <button
                    key={i}
                    type="button"
                    aria-label={`Ver ${p.alt || nome(i)}`}
                    onClick={() => setAberta(i)}
                  >
                    <Pic src={p.src} alt={p.alt || nome(i)} />
                  </button>
                );
              })}
            </li>
          ))}
        </ul>
        <p className="reelFoot mono">
          <span>{c.footLeft}</span>
          <span>{c.footRight}</span>
        </p>
      </div>

      {aberta !== null && c.items[aberta] ? (
        <Lightbox
          src={c.items[aberta].src}
          alt={c.items[aberta].alt || nome(aberta)}
          onClose={fechar}
        />
      ) : null}
    </section>
  );
}
