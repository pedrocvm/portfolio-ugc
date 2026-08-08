'use client';

import { useState } from 'react';
import { wa, type Content } from '@/lib/content';

type Mode = 'avulso' | 'mensal';

export default function Plans({
  c,
  phone,
}: {
  c: Content['plans'];
  phone: string;
}) {
  const [mode, setMode] = useState<Mode>('avulso');

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
          <div
            className="switch"
            data-mode={mode}
            role="group"
            aria-label="Modo de contratação"
          >
            <span className="knob" aria-hidden="true" />
            {(['avulso', 'mensal'] as Mode[]).map((m) => (
              <button
                key={m}
                className={'mono' + (mode === m ? ' on' : '')}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
              >
                {m === 'avulso' ? 'Avulso' : 'Mensal'}
              </button>
            ))}
          </div>

          <p className="modeHint">
            {mode === 'avulso' ? c.hintAvulso : c.hintMensal}
          </p>

          <ul className="planGrid">
            {c.items.map((p, i) => {
              const t = p[mode];
              return (
                <li key={i} className={'plan' + (p.best ? ' best' : '')}>
                  {p.best && <span className="badge mono">Recomendado</span>}
                  <h3 className="pname">{p.name}</h3>
                  <p className="pqty">{t.qty}</p>
                  <p className="pprice">
                    <span className="v">{t.price}</span>
                    <span className="cur">€</span>
                    <span className="suf">{t.suffix}</span>
                  </p>
                  <p className="pu mono">{t.unit}</p>
                  <ul className="feat">
                    {p.feat.map((f, k) => (
                      <li key={k}>{f}</li>
                    ))}
                  </ul>
                  <a
                    className="cta-btn"
                    href={wa(
                      phone,
                      `Olá Carol, quero o pacote ${p.name} ${
                        mode === 'avulso' ? 'avulso' : 'mensal'
                      } — ${t.qty}, ${t.price}€${t.suffix}. Podes dizer-me os próximos passos?`,
                    )}
                    target="_blank"
                    rel="noopener"
                  >
                    Escolher {p.name}
                  </a>
                </li>
              );
            })}
          </ul>

          <div className="extras">
            <div>
              <span className="mono eyebrow">{c.includedTitle}</span>
              <p className="inc">{c.includedText}</p>
            </div>
            <div className="addons">
              <span className="mono eyebrow">{c.addonsTitle}</span>
              {c.addons.map((a, i) => (
                <div className="row" key={i}>
                  <span className="mono">{a.label}</span>
                  <span className="val">{a.value}</span>
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
