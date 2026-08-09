import type { Content } from '@/lib/content';
import { isVideo } from '@/lib/media';
import Pic from './Pic';

export default function Session({ c }: { c: Content['session'] }) {
  const total = String(c.takes.length).padStart(2, '0');
  return (
    <section
      id="sessao"
      className="scene on-dark"
      data-bg="#2e2c2a"
      data-mode="dark"
      aria-label="As tomadas da sessão"
    >
      <div className="pinwrap">
        <div className="ambient" aria-hidden="true">
          {c.takes.map((t, i) =>
            isVideo(t.img) ? (
              <video key={i} src={t.img} muted playsInline preload="metadata" />
            ) : (
              <Pic key={i} src={t.img} alt="" />
            ),
          )}
          <i className="ov" />
        </div>
        <div className="head mono">
          <span>{c.label}</span>
          <span id="counter">
            {c.takes[0]?.n ?? '01'} / {total}
          </span>
        </div>
        <div className="stagewrap">
          <div className="bignum" id="bignum" aria-hidden="true">
            {c.takes[0]?.n ?? '01'}
          </div>
          <div className="frame" id="frame">
            {c.takes.map((t, i) => (
              <div
                className={'takeV' + (i === 0 ? ' on' : '')}
                key={i}
                data-n={t.n}
                data-niche={t.niche}
              >
                {isVideo(t.img) ? (
                  <video src={t.img} muted loop playsInline preload="metadata" />
                ) : (
                  <Pic src={t.img} alt="" />
                )}
                <span className="tg1 mono">
                  {[t.label, t.niche].filter(Boolean).join(' · ')}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="ficha mono">
          <span id="fichaTxt">{c.takes[0]?.niche ?? ''}</span>
          <span className="prog" aria-hidden="true">
            <i id="progFill" />
          </span>
          <span>{total}</span>
        </div>
      </div>
    </section>
  );
}
