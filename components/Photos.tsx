'use client';

import { PHOTOS } from '@/lib/site';
import { useReel } from './useReel';
import Pic from './Pic';

export default function Photos() {
  const { reelRef, atStart, atEnd, page } = useReel();

  return (
    <section id="fotos" className="chap" aria-label="Fotos UGC">
      <div className="wrap">
        <div className="chapHead">
          <span className="mono cn">02</span>
          <span className="mono eyebrow">Registos</span>
          <i />
        </div>
        <div className="reelHead">
          <h2 className="disp">
            Fotos <em className="serif-it">UGC.</em>
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
          {PHOTOS.map((src, i) => (
            <li key={src}>
              <Pic
                src={src}
                alt={`Foto UGC ${String(i + 1).padStart(2, '0')}`}
              />
              <span className="idx mono">
                {String(i + 1).padStart(2, '0')}
              </span>
            </li>
          ))}
        </ul>
        <p className="reelFoot mono">
          <span>Sessões próprias</span>
          <span>Lisboa</span>
        </p>
      </div>
    </section>
  );
}
