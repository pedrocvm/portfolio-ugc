'use client';

import { useState } from 'react';
import { PLANS, wa } from '@/lib/site';

type Mode = 'avulso' | 'mensal';

export default function Plans() {
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
          <span className="mono cn">04</span>
          <span className="mono eyebrow">Pacotes</span>
          <i />
        </div>
        <h2 className="disp">
          Quanto <em className="serif-it">custa.</em>
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
            {mode === 'avulso'
              ? 'Para um teste pontual ou uma campanha com data marcada.'
              : 'Para quem precisa de conteúdo novo todos os meses, com preço por vídeo mais baixo.'}
          </p>

          <ul className="planGrid">
            {PLANS.map((p) => {
              const t = p[mode];
              return (
                <li
                  key={p.name}
                  className={'plan' + (p.best ? ' best' : '')}
                >
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
                    {p.feat.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                  <a
                    className="cta-btn"
                    href={wa(
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
              <span className="mono eyebrow">Incluído em todos</span>
              <p className="inc">
                Roteiro meu, gravação, edição, legendas, revisão e uso orgânico.
                Entrega em 7 dias úteis depois de o produto chegar.
              </p>
            </div>
            <div className="addons">
              <span className="mono eyebrow">Add-ons</span>
              <div className="row">
                <span className="mono">Direitos para Ads · 6 meses</span>
                <span className="val">+75€</span>
              </div>
              <div className="row">
                <span className="mono">Abertura extra</span>
                <span className="val">25€</span>
              </div>
              <div className="row">
                <span className="mono">Revisão extra</span>
                <span className="val">25€</span>
              </div>
            </div>
          </div>

          <p className="lanc mono">Valores de lançamento</p>
        </div>
      </div>
    </section>
  );
}
