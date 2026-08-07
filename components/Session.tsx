import { TAKES } from '@/lib/site';

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
            <img key={t.n} src={t.img} alt="" />
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
                <img src={t.img} alt="" />
                <span className="tg1 mono">
                  Tomada {t.n} · {t.niche}
                </span>
                <span className="tg2 mono">
                  Imagem ilustrativa · vídeo por carregar
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
        <p className="autoral mono">Conteúdo autoral de demonstração</p>
      </div>
    </section>
  );
}
