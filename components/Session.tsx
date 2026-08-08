import { TAKES } from '@/lib/site';
import Pic from './Pic';

export default function Session() {
  return (
    <section
      id="sessao"
      className="scene on-dark"
      data-bg="#2e2c2a"
      data-mode="dark"
      aria-label="As seis tomadas"
    >
      <div className="pinwrap">
        <div className="ambient" aria-hidden="true">
          {TAKES.map((t) => (
            <Pic key={t.n} src={t.img} alt="" />
          ))}
          <i className="ov" />
        </div>
        <div className="head mono">
          <span>A sessão</span>
          <span id="counter">01 / 06</span>
        </div>
        <div className="stagewrap">
          <div className="bignum" id="bignum" aria-hidden="true">
            01
          </div>
          <div className="frame" id="frame">
            {TAKES.map((t, i) => (
              <div className={'takeV' + (i === 0 ? ' on' : '')} key={t.n}>
                <Pic src={t.img} alt="" />
                <span className="tg1 mono">
                  Tomada {t.n} · {t.niche}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="ficha mono">
          <span id="fichaTxt">Casa &amp; Decor</span>
          <span className="prog" aria-hidden="true">
            <i id="progFill" />
          </span>
          <span>06</span>
        </div>
      </div>
    </section>
  );
}
