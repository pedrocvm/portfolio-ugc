'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { addPayment, paymentReceived, saveLicense } from '@/app/dashboard/carolos-actions';
import { formatMoney, parseMoneyToCents } from '@/lib/money';
import { formatDate } from '@/lib/time';
import { label } from '@/lib/labels';
import type { LicenseRow } from '@/modules/rights/service';
import type { PaymentRow, RelationshipRow, RevenueSummary } from '@/modules/revenue/service';

/** Receita, licenças e relação.
 *
 *  Dinheiro e permuta aparecem sempre em colunas separadas. Somá-los daria à
 *  Carol a sensação de estar a ganhar mais do que ganha, que é exactamente o
 *  contrário do que esta tela existe para fazer. */

export default function Revenue({
  summary, payments, licenses, relationships, brands,
}: {
  summary: RevenueSummary;
  payments: PaymentRow[];
  licenses: LicenseRow[];
  relationships: RelationshipRow[];
  brands: { id: string; name: string }[];
}) {
  const expiring = licenses.filter((l) => l.expiry.state === 'expiring' || l.expiry.state === 'expired');
  const noEnd = licenses.filter((l) => l.expiry.state === 'no_end' && l.scope.paidAllowed);

  return (
    <>
      <div className="dashBar">
        <h1>Receita</h1>
      </div>

      <div className="osStats">
        <div className="osStat">
          <b>{formatMoney(summary.paidCents)}</b>
          <span>recebido</span>
        </div>
        <div className="osStat">
          <b>{formatMoney(summary.outstandingCents)}</b>
          <span>por receber</span>
        </div>
        <div className="osStat">
          <b>{formatMoney(summary.overdueCents)}</b>
          <span>em atraso</span>
        </div>
        <div className="osStat">
          <b>{formatMoney(summary.usageRevenueCents)}</b>
          <span>de licenças</span>
        </div>
        <div className="osStat">
          <b>{formatMoney(summary.barterValueCents)}</b>
          <span>em permuta <em>(não é receita)</em></span>
        </div>
      </div>

      {noEnd.length ? (
        <p className="osWarn">
          {noEnd.length === 1 ? 'Uma licença de uso pago não tem' : `${noEnd.length} licenças de uso pago não têm`}{' '}
          data de fim registada. Sem fim escrito, é perpetuidade por padrão.
        </p>
      ) : null}

      {expiring.length ? (
        <section className="osSection">
          <h2>Licenças a expirar</h2>
          <p className="osNote">É a altura de propor renovação — com a campanha ainda fresca na cabeça deles.</p>
          <div className="osRows">
            {expiring.map((l) => (
              <div className="osRow" key={l.id}>
                <div>
                  <span className="osRowName">{l.brandName}</span>
                  <p className="osRowSub">
                    {l.scope.platforms.join(', ') || 'canais não indicados'}
                    {l.scope.endAt ? ` · até ${formatDate(l.scope.endAt)}` : ''}
                  </p>
                </div>
                <div className="osRowSide">
                  <span className="osTag" data-tone={l.expiry.state === 'expired' ? 'bad' : 'hot'}>
                    {l.expiry.state === 'expired'
                      ? `expirou há ${l.expiry.daysAgo} dias`
                      : l.expiry.state === 'expiring'
                        ? `faltam ${l.expiry.daysLeft} dias`
                        : 'sem data de fim'}
                  </span>
                  {l.opportunityId ? (
                    <Link className="chip" href={`/dashboard/opportunities/${l.opportunityId}`}>Abrir</Link>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="osSection">
        <h2>Valores</h2>
        {payments.length ? (
          <div className="osRows">
            {payments.map((p) => (
              <div className="osRow" key={p.id}>
                <div>
                  <span className="osRowName" style={{ fontSize: 18 }}>
                    {p.brandName} · {formatMoney(p.amountCents)}
                  </span>
                  <p className="osRowSub">
                    {p.kind === 'barter'
                      ? 'permuta (não conta como receita)'
                      : label('paymentKind', p.kind)}
                    {p.dueAt ? ` · vence ${formatDate(p.dueAt)}` : ''}
                    {p.invoiceRef ? ` · ${p.invoiceRef}` : ''}
                  </p>
                </div>
                <div className="osRowSide">
                  <span className="osTag" data-tone={p.status === 'paid' ? 'ok' : p.dueAt && p.dueAt < new Date().toISOString().slice(0, 10) ? 'bad' : 'mute'}>
                    {label('paymentStatus', p.status)}
                  </span>
                  {p.status !== 'paid' && p.kind !== 'barter' ? <MarkPaid id={p.id} /> : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="osEmpty">
            Ainda não há valores registados. O histórico anterior ao CarolOS não foi reconstruído —
            a partir daqui fica tudo salvo.
          </p>
        )}
        <AddPayment brands={brands} />
      </section>

      <section className="osSection">
        <h2>Licenças</h2>
        <AddLicense brands={brands} />
        {licenses.length ? (
          <div className="osRows">
            {licenses.map((l) => (
              <div className="osRow" key={l.id}>
                <div>
                  <span className="osRowName" style={{ fontSize: 17 }}>{l.brandName}</span>
                  <p className="osRowSub">
                    {l.scope.paidAllowed ? 'pago' : 'orgânico'}
                    {l.scope.platforms.length ? ` · ${l.scope.platforms.join(', ')}` : ''}
                    {l.scope.endAt ? ` · até ${formatDate(l.scope.endAt)}` : ' · sem fim'}
                    {l.scope.exclusivity ? ' · exclusividade' : ''}
                    {l.scope.whitelisting ? ' · whitelisting' : ''}
                  </p>
                </div>
                <div className="osRowSide">
                  <span className="osTag" data-tone={l.status === 'active' ? 'ok' : 'mute'}>
                    {label('licenseStatus', l.status)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {relationships.length ? (
        <section className="osSection">
          <h2>Relações</h2>
          <p className="osNote">Quem paga, quanto, e quando foi a última vez.</p>
          <div className="osRows">
            {relationships.map((r) => (
              <Link className="osRow" key={r.brandId} href={`/dashboard/brands/${r.brandId}`}>
                <div>
                  <span className="osRowName">{r.brandName}</span>
                  <p className="osRowSub">
                    {r.wonCount} fechada(s) · {r.collaborationsCount} colaboração(ões)
                    {r.lastJobAt ? ` · último ${formatDate(r.lastJobAt)}` : ''}
                  </p>
                </div>
                <div className="osRowSide">
                  {r.totalCashCents > 0 ? <b>{formatMoney(r.totalCashCents)}</b> : null}
                  {r.totalBarterCents > 0 ? (
                    <span className="osTag" data-tone="mute">
                      {formatMoney(r.totalBarterCents)} em produto
                    </span>
                  ) : null}
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

function MarkPaid({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      className="chip"
      type="button"
      disabled={pending}
      onClick={() => start(() => paymentReceived(id).then(() => undefined))}
    >
      Recebido
    </button>
  );
}

function AddPayment({ brands }: { brands: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const [brandId, setBrandId] = useState('');
  const [kind, setKind] = useState<'cash' | 'reimbursement' | 'barter' | 'usage_license'>('cash');
  const [amount, setAmount] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [error, setError] = useState('');

  return (
    <details className="osEvidence" style={{ marginTop: 18 }}>
      <summary>Registar um valor</summary>
      <div className="osInline" style={{ marginTop: 12 }}>
        <label className="osField">
          <span>Marca</span>
          <select value={brandId} onChange={(e) => setBrandId(e.target.value)}>
            <option value="">Escolhe</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label className="osField">
          <span>Tipo</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="cash">Dinheiro</option>
            <option value="usage_license">Licença de uso</option>
            <option value="reimbursement">Reembolso</option>
            <option value="barter">Permuta (valor de produto)</option>
          </select>
        </label>
        <label className="osField">
          <span>Valor</span>
          <input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="osField">
          <span>Vence a</span>
          <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        </label>
        <button
          className="btn"
          type="button"
          disabled={pending || !brandId || !amount}
          onClick={() =>
            start(async () => {
              setError('');
              const result = await addPayment({
                brandId,
                kind,
                amountCents: parseMoneyToCents(amount) ?? 0,
                dueAt: dueAt || null,
              });
              if (result.error) return setError(result.error);
              setAmount('');
              setDueAt('');
            })
          }
        >
          Registar
        </button>
      </div>
      {error ? <p className="osWarn" role="alert">{error}</p> : null}
    </details>
  );
}

const PLATFORMS = ['Meta', 'TikTok', 'YouTube', 'Google'];

function AddLicense({ brands }: { brands: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const [brandId, setBrandId] = useState('');
  const [paid, setPaid] = useState(true);
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [startAt, setStartAt] = useState('');
  const [days, setDays] = useState('30');
  const [portfolio, setPortfolio] = useState<'yes' | 'no' | 'unknown'>('unknown');
  const [error, setError] = useState('');

  return (
    <details className="osEvidence" style={{ marginTop: 8, marginBottom: 18 }}>
      <summary>Registar uma licença</summary>
      <div className="osInline" style={{ marginTop: 12 }}>
        <label className="osField">
          <span>Marca</span>
          <select value={brandId} onChange={(e) => setBrandId(e.target.value)}>
            <option value="">Escolhe</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label className="osField">
          <span>Comece a</span>
          <input type="date" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
        </label>
        <label className="osField">
          <span>Dias</span>
          <input type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} />
        </label>
        <label className="osField">
          <span>Portfólio</span>
          <select value={portfolio} onChange={(e) => setPortfolio(e.target.value as typeof portfolio)}>
            <option value="unknown">Ainda não perguntei</option>
            <option value="yes">Autorizado</option>
            <option value="no">Não autorizado</option>
          </select>
        </label>
      </div>

      <label className="osCheck">
        <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
        <span>Uso em anúncios pagos</span>
      </label>

      {paid ? (
        <div className="osKinds">
          {PLATFORMS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={platforms.includes(p)}
              onClick={() => setPlatforms((v) => (v.includes(p) ? v.filter((x) => x !== p) : [...v, p]))}
            >
              {p}
            </button>
          ))}
        </div>
      ) : null}

      <div className="osActs">
        <button
          className="btn"
          type="button"
          disabled={pending || !brandId}
          onClick={() =>
            start(async () => {
              setError('');
              const result = await saveLicense({
                brandId,
                paidAllowed: paid,
                platforms,
                territories: [],
                startAt: startAt || null,
                durationDays: days ? Number(days) : null,
                whitelisting: false,
                exclusivity: false,
                exclusivityEndAt: null,
                rawFootage: false,
                portfolioPermission: portfolio === 'unknown' ? null : portfolio === 'yes',
                feeCents: null,
                notes: '',
              });
              if (result.error) setError(result.error);
            })
          }
        >
          Registar licença
        </button>
      </div>
      {error ? <p className="osWarn" role="alert">{error}</p> : null}
    </details>
  );
}
