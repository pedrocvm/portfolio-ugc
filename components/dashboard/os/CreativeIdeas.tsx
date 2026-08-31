'use client';

import { useState, useTransition } from 'react';
import { creativeIdeas } from '@/app/dashboard/carolos-actions';
import { FUNNEL_LABEL, FUNNEL_NOTE, type FunnelRole } from '@/modules/content/domain';

/** Hipóteses criativas.
 *
 *  Três a cinco ideias com funções diferentes na jornada, não três versões da
 *  mesma frase. É essa diferença que permite vender um pacote por cobertura de
 *  mensagem em vez de por desconto de quantidade. */

type Hypothesis = {
  id: string;
  title: string;
  funnel_role: string | null;
  friction: string;
  hook: string;
  core_message: string;
  demonstration: string;
  cta: string;
  emotion: string;
  capabilities: string[];
  status: string;
};

export default function CreativeIdeas({
  brandId,
  opportunityId,
  defaultProduct,
  aiEnabled,
  hypotheses,
}: {
  brandId: string;
  opportunityId: string | null;
  defaultProduct: string;
  aiEnabled: boolean;
  hypotheses: Hypothesis[];
}) {
  const [pending, start] = useTransition();
  const [product, setProduct] = useState(defaultProduct);
  const [objective, setObjective] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  return (
    <div className="osPanel">
      <h3>Hipóteses criativas</h3>
      <p className="osNote">
        Uma ideia principal por vídeo, e funções diferentes no funil. Para tecnologia, o padrão é
        fricção real → gancho → produto em contexto → transformação credível.
      </p>

      {hypotheses.length ? (
        <div className="osRows">
          {hypotheses.map((h) => (
            <div className="osRow" key={h.id}>
              <div>
                <span className="osRowName" style={{ fontSize: 17 }}>{h.title}</span>
                <p className="osRowSub">
                  <b>Fricção:</b> {h.friction}
                  <br />
                  <b>Gancho:</b> {h.hook}
                  <br />
                  <b>Demonstração:</b> {h.demonstration}
                  {h.cta ? <><br /><b>CTA:</b> {h.cta}</> : null}
                </p>
                {h.capabilities.length ? (
                  <div className="osMeta">
                    {h.capabilities.map((c) => (
                      <span key={c} className="osTag" data-tone="mute">{c}</span>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="osRowSide">
                {h.funnel_role ? (
                  <span
                    className="osTag"
                    data-tone="hot"
                    title={FUNNEL_NOTE[h.funnel_role as FunnelRole]}
                  >
                    {FUNNEL_LABEL[h.funnel_role as FunnelRole] ?? h.funnel_role}
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {!aiEnabled ? (
        <p className="osRowSub" style={{ marginTop: 14 }}>
          Ligue a camada de IA e os rascunhos em Definições para gerar hipóteses a partir do
          repertório que já tens.
        </p>
      ) : (
        <>
          <div className="osInline" style={{ marginTop: 16 }}>
            <label className="osField">
              <span>Produto</span>
              <input type="text" value={product} onChange={(e) => setProduct(e.target.value)} />
            </label>
            <label className="osField">
              <span>Objetivo da campanha</span>
              <input
                type="text"
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                placeholder="testar criativos para anúncios de conversão"
              />
            </label>
            <button
              className="btn"
              type="button"
              disabled={pending || !product.trim()}
              onClick={() =>
                start(async () => {
                  setError('');
                  setMessage('');
                  const result = await creativeIdeas(brandId, opportunityId, product, objective);
                  if (result.error) return setError(result.error);
                  setMessage(`${result.created} hipóteses geradas.`);
                })
              }
            >
              {pending ? 'A pensar…' : 'Gerar hipóteses'}
            </button>
          </div>
          {error ? <p className="osWarn" role="alert">{error}</p> : null}
          {message ? <p className="osWarn" data-tone="ok">{message}</p> : null}
        </>
      )}
    </div>
  );
}
