'use client';

import { useState, useTransition } from 'react';
import { quotePreview, saveQuote, sendQuote } from '@/app/dashboard/carolos-actions';
import { formatMoney, parseMoneyToCents } from '@/lib/money';
import { USAGE_TERMS, USAGE_TERM_LABEL, type QuoteResult, type UsageTerm } from '@/modules/pricing/engine';
import type { QuoteRow } from '@/modules/pricing/service';

/** Calculadora de preço e direitos.
 *
 *  Quando a política não tem um valor, o ecrã diz «por resolver» em vez de
 *  mostrar um número. É a diferença entre uma ferramenta que protege a Carol e
 *  uma que a faz confiar num palpite. */

const PLATFORMS = ['Meta', 'TikTok', 'YouTube', 'Google', 'LinkedIn', 'Pinterest'];
const TERRITORIES = ['Portugal', 'Espanha', 'Europa', 'Brasil', 'Mundial'];

type Scope = {
  videos: number;
  extraHooks: number;
  rawFootage: boolean;
  rush: boolean;
  paidUsage: boolean;
  usageTerm: UsageTerm | null;
  platforms: string[];
  territories: string[];
  whitelisting: boolean;
  exclusivity: boolean;
  perpetual: boolean;
};

const BLANK: Scope = {
  videos: 1,
  extraHooks: 0,
  rawFootage: false,
  rush: false,
  paidUsage: false,
  usageTerm: null,
  platforms: [],
  territories: [],
  whitelisting: false,
  exclusivity: false,
  perpetual: false,
};

export default function QuoteBuilder({
  opportunityId,
  quotes,
  policyVersion,
}: {
  opportunityId: string;
  quotes: QuoteRow[];
  policyVersion: string;
}) {
  const [scope, setScope] = useState<Scope>(BLANK);
  const [result, setResult] = useState<QuoteResult | null>(null);
  const [manual, setManual] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [pending, start] = useTransition();

  const set = <K extends keyof Scope>(key: K, value: Scope[K]) =>
    setScope((s) => ({ ...s, [key]: value }));

  const toggle = (key: 'platforms' | 'territories', value: string) =>
    setScope((s) => ({
      ...s,
      [key]: s[key].includes(value) ? s[key].filter((v) => v !== value) : [...s[key], value],
    }));

  const calculate = () =>
    start(async () => {
      setError('');
      const out = await quotePreview(scope);
      if ('error' in out && out.error) return setError(out.error);
      if ('quote' in out) setResult(out.quote);
    });

  const persist = () =>
    start(async () => {
      setError('');
      setSaved('');
      const final = manual.trim() ? parseMoneyToCents(manual) : null;
      const out = await saveQuote(opportunityId, scope, final, reason);
      if (out.error) return setError(out.error);
      setSaved('Orçamento guardado. Fica congelado assim que o marcares como enviado.');
    });

  return (
    <div className="osPanel">
      <h3>Preço e direitos</h3>
      <p className="osNote">
        Política em uso: <b>{policyVersion}</b>. A produção e a licença são coisas separadas, e
        nenhum valor sai daqui sem estar escrito numa versão da política.
      </p>

      <div className="osGrid">
        <div>
          <div className="osInline">
            <label className="osField">
              <span>Vídeos</span>
              <input
                type="number"
                min={1}
                value={scope.videos}
                onChange={(e) => set('videos', Math.max(1, Number(e.target.value)))}
              />
            </label>
            <label className="osField">
              <span>Hooks extra</span>
              <input
                type="number"
                min={0}
                value={scope.extraHooks}
                onChange={(e) => set('extraHooks', Math.max(0, Number(e.target.value)))}
              />
            </label>
          </div>

          <label className="osCheck">
            <input type="checkbox" checked={scope.rush} onChange={(e) => set('rush', e.target.checked)} />
            <span>Urgência<small>Prazo apertado que desloca outro trabalho.</small></span>
          </label>
          <label className="osCheck">
            <input type="checkbox" checked={scope.rawFootage} onChange={(e) => set('rawFootage', e.target.checked)} />
            <span>Ficheiros em bruto<small>Nunca incluídos por omissão. Entrega e licença à parte.</small></span>
          </label>

          <label className="osCheck">
            <input type="checkbox" checked={scope.paidUsage} onChange={(e) => set('paidUsage', e.target.checked)} />
            <span>Uso em anúncios pagos<small>Licença separada da produção.</small></span>
          </label>

          {scope.paidUsage ? (
            <>
              <label className="osField">
                <span>Período</span>
                <select
                  value={scope.usageTerm ?? ''}
                  onChange={(e) => set('usageTerm', (e.target.value || null) as UsageTerm | null)}
                >
                  <option value="">Ainda não sei — perguntar à marca</option>
                  {USAGE_TERMS.map((t) => (
                    <option key={t} value={t}>{USAGE_TERM_LABEL[t]}</option>
                  ))}
                </select>
              </label>

              <p className="osRowSub">Canais</p>
              <div className="osKinds">
                {PLATFORMS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={scope.platforms.includes(p)}
                    onClick={() => toggle('platforms', p)}
                  >
                    {p}
                  </button>
                ))}
              </div>

              <p className="osRowSub">Território</p>
              <div className="osKinds">
                {TERRITORIES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={scope.territories.includes(t)}
                    onClick={() => toggle('territories', t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </>
          ) : null}

          <label className="osCheck">
            <input type="checkbox" checked={scope.whitelisting} onChange={(e) => set('whitelisting', e.target.checked)} />
            <span>Whitelisting<small>Anúncios a correr a partir do perfil dela. Decisão só dela.</small></span>
          </label>
          <label className="osCheck">
            <input type="checkbox" checked={scope.exclusivity} onChange={(e) => set('exclusivity', e.target.checked)} />
            <span>Exclusividade<small>Bloqueia marcas concorrentes durante o período.</small></span>
          </label>
          <label className="osCheck">
            <input type="checkbox" checked={scope.perpetual} onChange={(e) => set('perpetual', e.target.checked)} />
            <span>Uso perpétuo ou buyout<small>Nunca concedido por omissão.</small></span>
          </label>

          <div className="osActs">
            <button className="btn" type="button" disabled={pending} onClick={calculate}>
              Calcular
            </button>
          </div>
        </div>

        <div>
          {result ? (
            <>
              <div className="osStats" style={{ marginBottom: 18 }}>
                <div className="osStat">
                  {result.recommendedCents !== null ? (
                    <b>{formatMoney(result.recommendedCents)}</b>
                  ) : (
                    <b><em>por resolver</em></b>
                  )}
                  <span>valor calculado</span>
                </div>
                <div className="osStat">
                  {result.minimumCents !== null ? (
                    <b>{formatMoney(result.minimumCents)}</b>
                  ) : (
                    <b><em>—</em></b>
                  )}
                  <span>piso</span>
                </div>
              </div>

              <div className="osRows">
                {result.lines.map((l) => (
                  <div className="osRow" key={l.id}>
                    <div>
                      <span className="osRowName" style={{ fontSize: 16 }}>{l.label}</span>
                      <p className="osRowSub">{l.basis}</p>
                    </div>
                    <div className="osRowSide">
                      {l.cents === null ? (
                        <span className="osTag" data-tone="bad">por resolver</span>
                      ) : (
                        <b>{formatMoney(l.cents)}</b>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {result.unresolved.length ? (
                <>
                  <p className="osRowSub" style={{ marginTop: 16 }}>A política não decide isto</p>
                  <ul className="osList" data-tone="bad">
                    {result.unresolved.map((u) => (
                      <li key={u.key}><b>{u.label}</b> — {u.why}</li>
                    ))}
                  </ul>
                </>
              ) : null}

              {result.blockingQuestions.length ? (
                <>
                  <p className="osRowSub" style={{ marginTop: 16 }}>Perguntar antes de fechar valor</p>
                  <ul className="osList">
                    {result.blockingQuestions.map((q) => <li key={q}>{q}</li>)}
                  </ul>
                </>
              ) : null}

              {result.humanOnly.length ? (
                <>
                  <p className="osRowSub" style={{ marginTop: 16 }}>Só tu podes decidir</p>
                  <ul className="osList" data-tone="bad">
                    {result.humanOnly.map((h) => <li key={h}>{h}</li>)}
                  </ul>
                </>
              ) : null}

              <label className="osField" style={{ marginTop: 18 }}>
                <span>{result.complete ? 'Valor final (deixa vazio para usar o calculado)' : 'Valor final, escrito por ti'}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={manual}
                  onChange={(e) => setManual(e.target.value)}
                  placeholder={result.recommendedCents !== null ? String(result.recommendedCents / 100) : '0,00'}
                />
              </label>

              <label className="osField">
                <span>Justificação, se estiver abaixo do piso ou fora da política</span>
                <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} />
              </label>

              <div className="osActs">
                <button className="btn" type="button" disabled={pending} onClick={persist}>
                  Guardar orçamento
                </button>
              </div>
            </>
          ) : (
            <p className="osRowSub">Escolhe o âmbito e carrega em calcular.</p>
          )}

          {error ? <p className="osWarn" role="alert">{error}</p> : null}
          {saved ? <p className="osWarn" data-tone="ok">{saved}</p> : null}
        </div>
      </div>

      {quotes.length ? (
        <>
          <p className="osRowSub" style={{ marginTop: 24 }}>Histórico</p>
          <div className="osRows">
            {quotes.map((q) => (
              <div className="osRow" key={q.id}>
                <div>
                  <span className="osRowName" style={{ fontSize: 16 }}>
                    v{q.version} · {formatMoney(q.finalCents ?? q.recommendedCents)}
                  </span>
                  <p className="osRowSub">
                    política {q.policyVersion}
                    {q.belowFloor ? ' · abaixo do piso' : ''}
                    {q.unresolved.length ? ` · ${q.unresolved.length} item(s) por resolver` : ''}
                  </p>
                </div>
                <div className="osRowSide">
                  <span className="osTag" data-tone={q.status === 'sent' ? 'ok' : 'mute'}>{q.status}</span>
                  {q.status === 'draft' ? (
                    <SendQuote quoteId={q.id} opportunityId={opportunityId} />
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function SendQuote({ quoteId, opportunityId }: { quoteId: string; opportunityId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      className="chip"
      type="button"
      disabled={pending}
      onClick={() => start(() => sendQuote(quoteId, opportunityId).then(() => undefined))}
    >
      Marcar como enviado
    </button>
  );
}
