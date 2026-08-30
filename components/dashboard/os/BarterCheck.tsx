'use client';

import { useState, useTransition } from 'react';
import { evaluateBarter } from '@/app/dashboard/carolos-actions';
import { formatMoney, parseMoneyToCents } from '@/lib/money';
import { DECISION_LABEL, type BarterResult } from '@/modules/barter/engine';

/** Avaliação de permuta.
 *
 *  A pergunta que muda tudo é «comprarias isto com o teu dinheiro?». Um
 *  produto de 400 € que ela nunca usaria não vale 400 € — vale o tempo de
 *  produção que ocupa, que é negativo. */

const SCALE = [0, 1, 2, 3, 4, 5];

export default function BarterCheck({ cashAlternativeCents }: { cashAlternativeCents: number | null }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<BarterResult | null>(null);

  const [retail, setRetail] = useState('');
  const [wouldBuy, setWouldBuy] = useState<'yes' | 'no' | 'unknown'>('unknown');
  const [interest, setInterest] = useState(3);
  const [effort, setEffort] = useState(3);
  const [strategic, setStrategic] = useState(3);
  const [portfolio, setPortfolio] = useState(3);
  const [paidUsage, setPaidUsage] = useState(false);
  const [whitelisting, setWhitelisting] = useState(false);
  const [exclusivity, setExclusivity] = useState(false);
  const [rawFootage, setRawFootage] = useState(false);

  const run = () =>
    start(async () => {
      setResult(
        await evaluateBarter({
          retailPriceCents: parseMoneyToCents(retail),
          valueToCarolCents: null,
          wouldBuy: wouldBuy === 'unknown' ? null : wouldBuy === 'yes',
          productInterest: interest,
          productionEffort: effort,
          strategicValue: strategic,
          portfolioValue: portfolio,
          rightsRequested: { paidUsage, whitelisting, exclusivity, rawFootage },
          cashAlternativeCents,
        }),
      );
    });

  const tone =
    result?.decision === 'ACCEPT_BARTER' ? 'ok'
      : result?.decision === 'DECLINE' ? 'bad'
        : 'hot';

  return (
    <div className="osPanel">
      <h3>Vale a pena esta permuta?</h3>
      <p className="osNote">
        O preço de etiqueta é o sinal mais fraco. O que conta é se querias mesmo o produto, quanto
        trabalho custa e que direitos vêm agarrados.
      </p>

      <div className="osGrid">
        <div>
          <label className="osField">
            <span>Preço do produto</span>
            <input
              type="text"
              inputMode="decimal"
              value={retail}
              onChange={(e) => setRetail(e.target.value)}
              placeholder="0,00"
            />
          </label>

          <label className="osField">
            <span>Comprarias isto com o teu dinheiro?</span>
            <select value={wouldBuy} onChange={(e) => setWouldBuy(e.target.value as typeof wouldBuy)}>
              <option value="unknown">Não sei / talvez</option>
              <option value="yes">Sim, já queria</option>
              <option value="no">Não</option>
            </select>
          </label>

          <Slider label="Interesse no produto" value={interest} onChange={setInterest} />
          <Slider label="Esforço de produção" value={effort} onChange={setEffort}
            hint="5 = ocupa o dia todo, vários cenários." />
          <Slider label="Valor estratégico da marca" value={strategic} onChange={setStrategic}
            hint="Potencial de trabalho pago e recorrente depois." />
          <Slider label="Valor para o portfólio" value={portfolio} onChange={setPortfolio}
            hint="Preenche uma competência que ainda falta?" />

          <p className="osRowSub" style={{ marginTop: 12 }}>Direitos pedidos além do orgânico</p>
          <label className="osCheck">
            <input type="checkbox" checked={paidUsage} onChange={(e) => setPaidUsage(e.target.checked)} />
            <span>Anúncios pagos</span>
          </label>
          <label className="osCheck">
            <input type="checkbox" checked={whitelisting} onChange={(e) => setWhitelisting(e.target.checked)} />
            <span>Whitelisting</span>
          </label>
          <label className="osCheck">
            <input type="checkbox" checked={exclusivity} onChange={(e) => setExclusivity(e.target.checked)} />
            <span>Exclusividade</span>
          </label>
          <label className="osCheck">
            <input type="checkbox" checked={rawFootage} onChange={(e) => setRawFootage(e.target.checked)} />
            <span>Ficheiros em bruto</span>
          </label>

          <div className="osActs">
            <button className="btn" type="button" disabled={pending} onClick={run}>
              Avaliar
            </button>
          </div>
        </div>

        <div>
          {result ? (
            <>
              <span className="osTag" data-tone={tone}>{DECISION_LABEL[result.decision]}</span>

              <div className="osStats" style={{ margin: '16px 0' }}>
                <div className="osStat">
                  <b>{formatMoney(result.effectiveValueCents)}</b>
                  <span>vale para ti</span>
                </div>
                <div className="osStat">
                  {result.estimatedCostCents !== null ? (
                    <b>{formatMoney(result.estimatedCostCents)}</b>
                  ) : (
                    <b><em>—</em></b>
                  )}
                  <span>custa em trabalho</span>
                </div>
              </div>

              <ul className="osList">
                {result.reasons.map((r) => <li key={r}>{r}</li>)}
              </ul>

              {result.missing.length ? (
                <>
                  <p className="osRowSub" style={{ marginTop: 14 }}>Falta saber</p>
                  <ul className="osList" data-tone="bad">
                    {result.missing.map((m) => <li key={m}>{m}</li>)}
                  </ul>
                </>
              ) : null}

              <p className="osRowSub" style={{ marginTop: 14 }}>
                Este valor nunca entra na receita: produto não é dinheiro.
              </p>
            </>
          ) : (
            <p className="osRowSub">Preenche e avalia. Nenhuma resposta é gravada — isto é para pensar.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Slider({
  label, value, onChange, hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  hint?: string;
}) {
  return (
    <label className="osField">
      <span>{label}</span>
      <div className="osKinds">
        {SCALE.map((n) => (
          <button key={n} type="button" aria-pressed={value === n} onClick={() => onChange(n)}>
            {n}
          </button>
        ))}
      </div>
      {hint ? <small style={{ color: 'var(--tinta3)', fontSize: 13 }}>{hint}</small> : null}
    </label>
  );
}
