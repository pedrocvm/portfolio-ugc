import { IMAGES, VIDEOS } from '@/lib/site';

export default function Hero() {
  return (
    <header
      id="hero"
      className="scene on-dark"
      data-bg="#2e2c2a"
      data-mode="dark"
    >
      <div className="bgimg" data-par="" aria-hidden="true">
        <video
          data-src={VIDEOS.hero}
          data-src-sm={VIDEOS.heroSm}
          autoPlay
          muted
          loop
          playsInline
          preload="none"
          tabIndex={-1}
        />
        <picture>
          <source
            media="(min-width:820px)"
            srcSet={IMAGES.heroWideAvif}
            type="image/avif"
          />
          <source
            media="(min-width:820px)"
            srcSet={IMAGES.heroWideWebp}
            type="image/webp"
          />
          <source media="(min-width:820px)" srcSet={IMAGES.heroWide} />
          <source srcSet={IMAGES.heroPortraitAvif} type="image/avif" />
          <source srcSet={IMAGES.heroPortraitWebp} type="image/webp" />
          <img
            src={IMAGES.heroPortrait}
            alt=""
            fetchPriority="high"
            decoding="async"
          />
        </picture>
        <i className="ov" />
      </div>
      <div className="top mono">
        <span style={{ whiteSpace: 'nowrap' }}>Portfólio · 2026</span>
      </div>
      <div className="stage">
        <div className="titleBox">
          <p className="kicker mono">
            UGC Creator · Portugal<i />
          </p>
          <h1 className="disp name hl">
            <span className="line">
              <span className="l1" aria-label="Carolina">
                {[...'Carolina'].map((c, i) => (
                  <span
                    className="ch"
                    key={i}
                    aria-hidden="true"
                    style={{ '--i': i } as React.CSSProperties}
                  >
                    {c}
                  </span>
                ))}
              </span>
              <i className="nib" aria-hidden="true" />
            </span>
            <span className="line">
              <span className="l2" aria-label="Queiroz">
                {[...'Queiroz'].map((c, i) => (
                  <span
                    className="ch"
                    key={i}
                    aria-hidden="true"
                    style={{ '--i': i + 8 } as React.CSSProperties}
                  >
                    {c}
                  </span>
                ))}
              </span>
              <i className="nib" aria-hidden="true" />
            </span>
          </h1>
        </div>
      </div>
      <div className="foot mono">
        <span className="scrollcue">
          Rolar
          <i />
        </span>
      </div>
    </header>
  );
}
