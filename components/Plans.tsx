import { wa, type Content } from '@/lib/content';

export default function Plans({
  c,
  phone,
}: {
  c: Content['plans'];
  phone: string;
}) {
  return (
    <section
      id="pacotes"
      className="chap dark"
      data-bg="#2e2c2a"
      data-mode="dark"
      aria-label="Pacotes"
    >
      <div className="wrap">
        <div className="chapHead">
          <span className="mono cn">{c.num}</span>
          <span className="mono eyebrow">{c.eyebrow}</span>
          <i />
        </div>
        <h2 className="disp">
          {c.titleLead} <em className="serif-it">{c.titleEm}</em>
        </h2>
        <div className="price">
          <ul className="planGrid">
            {c.items.map((p, i) => (
              <li key={i} className={'plan' + (p.best ? ' best' : '')}>
                {p.best && <span className="badge mono">Recomendado</span>}
                <h3 className="pname">{p.name}</h3>
                <p className="pqty">{p.qty}</p>
                {c.showPrices ? (
                  <>
                    <p className="pprice">
                      <span className="v">{p.price}</span>
                      <span className="cur">€</span>
                      <span className="suf">{p.suffix}</span>
                    </p>
                    <p className="pu mono">{p.unit}</p>
                  </>
                ) : null}
                <ul className="feat">
                  {p.feat.map((f, k) => (
                    <li key={k}>{f}</li>
                  ))}
                </ul>
                <a
                  className="cta-btn"
                  href={wa(
                    phone,
                    `Olá Carol, quero o pacote ${p.name} — ${p.qty}${
                      c.showPrices ? `, ${p.price}€${p.suffix}` : ''
                    }. Podes dizer-me os próximos passos?`,
                  )}
                  target="_blank"
                  rel="noopener"
                >
                  Escolher {p.name}
                </a>
              </li>
            ))}
          </ul>

          <div className="extras">
            <div>
              <span className="mono eyebrow">{c.includedTitle}</span>
              <p className="inc">{c.includedText}</p>
            </div>
            <div className="addons">
              <h3 className="addonsTitle">{c.addonsTitle}</h3>
              {c.addons.map((a, i) => (
                <div className="row" key={i}>
                  <span className="mono">{a.label}</span>
                  {c.showPrices ? <span className="val">{a.value}</span> : null}
                </div>
              ))}
            </div>
          </div>

          <p className="lanc mono">{c.note}</p>
        </div>
      </div>
    </section>
  );
}
