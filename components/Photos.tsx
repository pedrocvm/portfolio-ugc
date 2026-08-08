'use client';

import type { Content } from '@/lib/content';
import { useReel } from './useReel';
import Pic from './Pic';

export default function Photos({ c }: { c: Content['photos'] }) {
  const { reelRef, atStart, atEnd, page } = useReel();

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
        <ul className="reel" id="fotosReel" ref={reelRef}>
          {c.items.map((p, i) => (
            <li key={i}>
              <Pic
                src={p.src}
                alt={p.alt || `Foto UGC ${String(i + 1).padStart(2, '0')}`}
              />
              <span className="idx mono">
                {String(i + 1).padStart(2, '0')}
              </span>
            </li>
          ))}
        </ul>
        <p className="reelFoot mono">
          <span>{c.footLeft}</span>
          <span>{c.footRight}</span>
        </p>
      </div>
    </section>
  );
}
