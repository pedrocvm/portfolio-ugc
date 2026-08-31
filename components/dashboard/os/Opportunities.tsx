import Link from 'next/link';
import { formatMoney } from '@/lib/money';
import { relativeDays } from '@/lib/time';
import { STAGES, STAGE_LABEL, isClosed, type Stage } from '@/modules/opportunities/domain';
import type { OpportunityRow } from '@/modules/opportunities/service';

/** O funil existe para ver exceções, não para arrastar cartões o dia todo.
 *  A coluna que interessa é a que tem oportunidades sem próxima ação. */

const OPEN: Stage[] = [
  'discovered', 'qualified', 'outreach', 'replied',
  'commercial_qualification', 'proposal', 'negotiation',
];

export default function Opportunities({ rows }: { rows: OpportunityRow[] }) {
  const open = rows.filter((r) => !isClosed(r.stage) && r.stage !== 'nurture');
  const nurture = rows.filter((r) => r.stage === 'nurture');
  const closed = rows.filter((r) => isClosed(r.stage));

  const stuck = open.filter((r) => !r.nextActionText.trim() && !r.waitingUntil);
  const expectedCents = open.reduce((sum, r) => sum + (r.expectedCashCents ?? 0), 0);

  return (
    <>
      <div className="dashBar">
        <h1>Oportunidades</h1>
        <span className="dashState">{open.length} abertas</span>
      </div>

      <div className="osStats">
        <div className="osStat">
          <b>{open.length}</b>
          <span>em jogo</span>
        </div>
        <div className="osStat">
          <b>{stuck.length}</b>
          <span>sem próxima ação</span>
        </div>
        <div className="osStat">
          <b>{closed.filter((r) => r.stage === 'won').length}</b>
          <span>fechadas</span>
        </div>
        <div className="osStat">
          {expectedCents > 0 ? <b>{formatMoney(expectedCents)}</b> : <b><em>—</em></b>}
          <span>valor esperado</span>
        </div>
      </div>

      {stuck.length ? (
        <p className="osWarn">
          {stuck.length === 1 ? 'Uma oportunidade ativa está' : `${stuck.length} oportunidades ativas estão`}{' '}
          sem próxima ação nem estado de espera. É assim que um lead morno morre.
        </p>
      ) : null}

      <section className="osSection">
        <div className="osBoard">
          {OPEN.map((stage) => {
            const list = open.filter((r) => r.stage === stage);
            return (
              <div className="osCol" key={stage}>
                <div className="osColHead">
                  <span>{STAGE_LABEL[stage]}</span>
                  <b>{list.length}</b>
                </div>
                {list.length ? (
                  list.map((o) => (
                    <Link className="osMini" key={o.id} href={`/dashboard/opportunities/${o.id}`}>
                      {o.brandName}
                      <small>
                        {o.nextActionText || 'sem próxima ação'}
                        {o.lastActivityAt ? ` · ${relativeDays(o.lastActivityAt)}` : ''}
                      </small>
                    </Link>
                  ))
                ) : (
                  <p className="osRowSub">—</p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {nurture.length ? (
        <section className="osSection">
          <h2>Nurture</h2>
          <p className="osNote">Sem sequência ativa. Voltam quando houver contexto novo.</p>
          <div className="osRows">
            {nurture.map((o) => (
              <Link className="osRow" key={o.id} href={`/dashboard/opportunities/${o.id}`}>
                <div>
                  <span className="osRowName">{o.brandName}</span>
                  <p className="osRowSub">{o.nextActionText || o.title}</p>
                </div>
                <div className="osRowSide">
                  {o.lastActivityAt ? <span>{relativeDays(o.lastActivityAt)}</span> : null}
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {closed.length ? (
        <section className="osSection">
          <h2>Fechadas</h2>
          <div className="osRows">
            {closed.map((o) => (
              <Link className="osRow" key={o.id} href={`/dashboard/opportunities/${o.id}`}>
                <div>
                  <span className="osRowName">{o.brandName}</span>
                  <p className="osRowSub">{o.stage === 'won' ? o.title : o.lossReason || 'motivo não documentado'}</p>
                </div>
                <div className="osRowSide">
                  <span className="osTag" data-tone={o.stage === 'won' ? 'won' : 'lost'}>
                    {STAGE_LABEL[o.stage]}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {rows.length === 0 ? (
        <p className="osEmpty">
          Ainda não há oportunidades. Elas nascem sozinhas de uma conversa no Gmail, ou de uma
          <Link href="/dashboard/capture"> captura rápida</Link>.
        </p>
      ) : null}
    </>
  );
}

export { STAGES };
