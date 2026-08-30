'use client';

import { useState, useTransition } from 'react';
import { overrideFit, rescoreBrand } from '@/app/dashboard/carolos-actions';
import { FIT_LABEL, FIT_WEIGHTS, type FitCriterion, type FitLine } from '@/modules/brands/fit';
import { NICHES } from '@/modules/brands/niches';

/** O fit tem de conseguir explicar-se linha a linha, e tem de aceitar que a
 *  Carol discorde. Um score que não se explica nem se corrige é superstição
 *  com número. */

const SCORED: FitCriterion[] = (Object.keys(FIT_WEIGHTS) as FitCriterion[]).filter(
  (c) => c !== 'category',
);

export default function FitPanel({
  brandId,
  nicheId,
  score,
  band,
  lines,
  policyVersion,
  override,
}: {
  brandId: string;
  nicheId: string | null;
  score: number | null;
  band: string | null;
  lines: FitLine[];
  policyVersion: string | null;
  override: { score: number; reason: string } | null;
}) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [niche, setNiche] = useState(nicheId ?? '');
  const [signals, setSignals] = useState<Partial<Record<FitCriterion, number>>>(
    Object.fromEntries(lines.filter((l) => !l.assumed).map((l) => [l.criterion, l.score])),
  );
  const [overrideScore, setOverrideScore] = useState(String(override?.score ?? score ?? 50));
  const [overrideReason, setOverrideReason] = useState(override?.reason ?? '');
  const [error, setError] = useState('');

  const excluded = NICHES.find((n) => n.id === niche)?.tier === 'EXCLUDED';

  return (
    <div className="osPanel">
      <h3>Fit</h3>

      <div className="osStats" style={{ marginTop: 14 }}>
        <div className="osStat">
          <b>{override?.score ?? score ?? '—'}</b>
          <span>{override ? 'score (corrigido por ti)' : 'score'}</span>
        </div>
        <div className="osStat">
          <b><em>{band ?? '—'}</em></b>
          <span>banda</span>
        </div>
        <div className="osStat">
          <b><em>{policyVersion ?? 'por calcular'}</em></b>
          <span>política</span>
        </div>
      </div>

      {excluded ? (
        <p className="osWarn">
          Skincare e haircare estão fora da estratégia. Esta marca pode continuar no histórico, mas
          não recebe bónus de categoria nem entra em sugestões de prospecção.
        </p>
      ) : null}

      {lines.length ? (
        <div className="osBars">
          {lines.map((l) => (
            <div className="osBar" key={l.criterion} data-assumed={l.assumed ? '1' : undefined}>
              <span>{l.label}</span>
              <i style={{ width: `${(l.points / l.weight) * 100}%` }} />
              <b>
                {l.points.toFixed(1)}/{l.weight}
                {l.assumed ? ' ?' : ''}
              </b>
            </div>
          ))}
          <p className="osRowSub">
            As barras tracejadas são critérios sem sinal. Contam como neutro, não como zero:
            desconhecido não é o mesmo que incompatível.
          </p>
        </div>
      ) : (
        <p className="osRowSub">Ainda não há fit calculado para esta marca.</p>
      )}

      <div className="osActs">
        <button className="chip" type="button" onClick={() => setOpen((v) => !v)}>
          {open ? 'Fechar' : 'Avaliar ou corrigir'}
        </button>
      </div>

      {open ? (
        <>
          <label className="osField" style={{ marginTop: 16 }}>
            <span>Categoria</span>
            <select value={niche} onChange={(e) => setNiche(e.target.value)}>
              <option value="">Por definir</option>
              {NICHES.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label} {n.tier === 'EXCLUDED' ? '(fora da estratégia)' : `· ${n.tier}`}
                </option>
              ))}
            </select>
          </label>

          {SCORED.map((c) => (
            <label className="osField" key={c}>
              <span>{FIT_LABEL[c]} · peso {FIT_WEIGHTS[c]}</span>
              <div className="osKinds">
                <button
                  type="button"
                  aria-pressed={signals[c] === undefined}
                  onClick={() => setSignals((s) => ({ ...s, [c]: undefined }))}
                >
                  não sei
                </button>
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={signals[c] === n}
                    onClick={() => setSignals((s) => ({ ...s, [c]: n }))}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </label>
          ))}

          <div className="osActs">
            <button
              className="btn"
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setError('');
                  const result = await rescoreBrand(brandId, signals, niche || null);
                  if (result.error) setError(result.error);
                })
              }
            >
              Recalcular
            </button>
          </div>

          <details className="osEvidence" style={{ marginTop: 18 }}>
            <summary>Discordo do score</summary>
            <div className="osInline" style={{ marginTop: 12 }}>
              <label className="osField">
                <span>Score que queres</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={overrideScore}
                  onChange={(e) => setOverrideScore(e.target.value)}
                />
              </label>
              <label className="osField">
                <span>Porquê</span>
                <input type="text" value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />
              </label>
              <button
                className="btn"
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    setError('');
                    const result = await overrideFit(brandId, Number(overrideScore), overrideReason);
                    if (result.error) setError(result.error);
                  })
                }
              >
                Guardar
              </button>
            </div>
            <p className="osRowSub">O cálculo original fica guardado ao lado. Nada é apagado.</p>
          </details>
        </>
      ) : null}

      {error ? <p className="osWarn" role="alert">{error}</p> : null}
    </div>
  );
}
