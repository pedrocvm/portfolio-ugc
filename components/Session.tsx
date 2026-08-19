import type { Content } from '@/lib/content';
import { isVideo } from '@/lib/media';
import Pic from './Pic';

export default function Session({ c }: { c: Content['session'] }) {
  return (
    <section
      id="sessao"
      className="scene on-dark"
      data-bg="#2e2c2a"
      data-mode="dark"
      aria-label="As tomadas da sessão"
    >
      <div className="wrap">
        <div className="head mono">
          <span>{c.label}</span>
        </div>
        <ul className="sessGrid">
          {c.takes.map((t, i) => (
            <li className="takeCard" key={i}>
              {isVideo(t.img) ? (
                <video
                  data-lazy-src={t.img}
                  controls
                  playsInline
                  loop
                  preload="metadata"
                />
              ) : (
                <Pic src={t.img} alt="" />
              )}
              <span className="tg1 mono">
                {[t.label, t.niche].filter(Boolean).join(' · ')}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
