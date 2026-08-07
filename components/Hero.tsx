import { IMAGES } from '@/lib/site';

export default function Hero() {
  return (
    <header
      id="hero"
      className="scene on-dark"
      data-bg="#2e2c2a"
      data-mode="dark"
    >
      <div className="bgimg" data-par="" aria-hidden="true">
        <picture>
          <source media="(min-width:820px)" srcSet={IMAGES.heroWide} />
          <img src={IMAGES.heroPortrait} alt="" />
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
              <span className="l1">Carolina</span>
              <i className="nib" aria-hidden="true" />
            </span>
            <span className="line">
              <span className="l2">Queiroz</span>
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
