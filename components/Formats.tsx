import { IMAGES, VIDEOS } from '@/lib/site';

const FORMATS = [
  ['Demonstração de produto', ''],
  ['Review', ''],
  ['Rotina', ''],
  ['Unboxing', ''],
  ['Voice-over', 'A combinar'],
];

export default function Formats() {
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
          data-src={VIDEOS.formats}
          data-src-sm={VIDEOS.formatsSm}
          autoPlay
          muted
          loop
          playsInline
          preload="none"
          tabIndex={-1}
        />
        <picture>
          <source
            media="(min-width: 900px)"
            srcSet={IMAGES.formatsAvif}
            type="image/avif"
          />
          <source
            media="(min-width: 900px)"
            srcSet={IMAGES.formatsWebp}
            type="image/webp"
          />
          <source media="(min-width: 900px)" srcSet={IMAGES.formats} />
          <source srcSet={IMAGES.formatsSmAvif} type="image/avif" />
          <source srcSet={IMAGES.formatsSmWebp} type="image/webp" />
          <img
            src={IMAGES.formatsSm}
            alt=""
            loading="lazy"
            decoding="async"
          />
        </picture>
        <i className="ov" />
      </div>
      <div className="wrap">
        <div className="chapHead">
          <span className="mono cn">01</span>
          <span className="mono eyebrow">Formatos</span>
          <i />
        </div>
        <h2 className="disp">
          O que posso <em className="serif-it">gravar.</em>
        </h2>
        <ul className="fmt">
          {FORMATS.map(([name, note]) => (
            <li key={name}>
              <span>{name}</span>
              {note ? <span className="st mono">{note}</span> : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
