import type { Content } from '@/lib/content';
import { derive, hasDerivatives } from '@/lib/media';

function Letters({ word, offset }: { word: string; offset: number }) {
  return (
    <>
      {[...word].map((c, i) => (
        <span
          className="ch"
          key={i}
          aria-hidden="true"
          style={{ '--i': i + offset } as React.CSSProperties}
        >
          {c}
        </span>
      ))}
    </>
  );
}

export default function Hero({ c }: { c: Content['hero'] }) {
  const wide = hasDerivatives(c.imageWide);
  const portrait = hasDerivatives(c.imagePortrait);
  return (
    <header
      id="hero"
      className="scene on-dark"
      data-bg="#2e2c2a"
      data-mode="dark"
    >
      <div className="bgimg" data-par="" aria-hidden="true">
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
              media="(min-width:820px)"
              srcSet={derive(c.imageWide, 'avif')}
              type="image/avif"
            />
          )}
          {wide && (
            <source
              media="(min-width:820px)"
              srcSet={derive(c.imageWide, 'webp')}
              type="image/webp"
            />
          )}
          <source media="(min-width:820px)" srcSet={c.imageWide} />
          {portrait && (
            <source srcSet={derive(c.imagePortrait, 'avif')} type="image/avif" />
          )}
          {portrait && (
            <source srcSet={derive(c.imagePortrait, 'webp')} type="image/webp" />
          )}
          <img
            src={c.imagePortrait}
            alt=""
            fetchPriority="high"
            decoding="async"
          />
        </picture>
        <i className="ov" />
      </div>
      <div className="top mono">
        <span style={{ whiteSpace: 'nowrap' }}>{c.top}</span>
      </div>
      <div className="stage">
        <div className="titleBox">
          <p className="kicker mono">
            {c.kicker}
            <i />
          </p>
          <h1 className="disp name hl">
            <span className="line">
              <span className="l1" aria-label={c.firstName}>
                <Letters word={c.firstName} offset={0} />
              </span>
              <i className="nib" aria-hidden="true" />
            </span>
            <span className="line">
              <span className="l2" aria-label={c.lastName}>
                <Letters word={c.lastName} offset={c.firstName.length} />
              </span>
              <i className="nib" aria-hidden="true" />
            </span>
          </h1>
        </div>
      </div>
      <div className="foot mono">
        <span className="scrollcue">
          {c.scroll}
          <i />
        </span>
      </div>
    </header>
  );
}
