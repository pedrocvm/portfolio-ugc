import type { Content } from '@/lib/content';
import { derive, hasDerivatives } from '@/lib/media';

export default function Formats({ c }: { c: Content['formats'] }) {
  const wide = hasDerivatives(c.image);
  const small = hasDerivatives(c.imageSm);
  return (
    <section
      id="formatos"
      className="chap scene on-dark"
      data-bg="#2e2c2a"
      data-mode="dark"
      aria-label="Formatos"
    >
      <div className="bgimg" aria-hidden="true">
        <video
          data-src={c.video.src}
          data-src-sm={c.video.srcSm || c.video.src}
          autoPlay
          muted
          loop
          playsInline
          preload="none"
          tabIndex={-1}
        />
        <picture>
          {wide && (
            <source
              media="(min-width: 900px)"
              srcSet={derive(c.image, 'avif')}
              type="image/avif"
            />
          )}
          {wide && (
            <source
              media="(min-width: 900px)"
              srcSet={derive(c.image, 'webp')}
              type="image/webp"
            />
          )}
          <source media="(min-width: 900px)" srcSet={c.image} />
          {small && (
            <source srcSet={derive(c.imageSm, 'avif')} type="image/avif" />
          )}
          {small && (
            <source srcSet={derive(c.imageSm, 'webp')} type="image/webp" />
          )}
          <img src={c.imageSm} alt="" loading="lazy" decoding="async" />
        </picture>
        <i className="ov" />
      </div>
      <div className="wrap">
        <div className="chapHead">
          <span className="mono cn">{c.num}</span>
          <span className="mono eyebrow">{c.eyebrow}</span>
          <i />
        </div>
        <h2 className="disp">
          {c.titleLead} <em className="serif-it">{c.titleEm}</em>
        </h2>
        <ul className="fmt">
          {c.items.map((f) => (
            <li key={f.name}>
              <span>{f.name}</span>
              {f.note ? <span className="st mono">{f.note}</span> : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
