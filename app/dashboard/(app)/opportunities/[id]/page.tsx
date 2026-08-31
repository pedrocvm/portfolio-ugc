import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { formatMoney } from '@/lib/money';
import { formatDate, relativeDays } from '@/lib/time';
import { label } from '@/lib/labels';
import { supabaseServer } from '@/lib/supabase/server';
import { actionsForOpportunity } from '@/modules/actions/service';
import { opportunityTimeline } from '@/modules/activity/service';
import { threadsForOpportunity } from '@/modules/inbox/queries';
import { STAGE_LABEL, MODEL_LABEL } from '@/modules/opportunities/domain';
import { STATUS_LABEL, type CollaborationStatus } from '@/modules/production/domain';
import { documentsFor, unlinkedDocumentsFor } from '@/modules/documents/service';
import { getOpportunity } from '@/modules/opportunities/service';
import { activePolicy, quotesFor } from '@/modules/pricing/service';
import { licensesForBrand } from '@/modules/rights/service';
import { getFlags } from '@/modules/settings/service';
import BarterCheck from '@/components/dashboard/os/BarterCheck';
import Copilot from '@/components/dashboard/os/Copilot';
import Documents from '@/components/dashboard/os/Documents';
import QuoteBuilder from '@/components/dashboard/os/QuoteBuilder';
import StageControl from '@/components/dashboard/os/StageControl';
import Timeline from '@/components/dashboard/os/Timeline';

export const dynamic = 'force-dynamic';

/** A bancada de trabalho de uma negociação. Tudo o que é preciso para decidir
 *  está nesta página: história, estado, riscos, preço, permuta e resposta. */
export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;

  const opportunity = await getOpportunity(id);
  if (!opportunity) notFound();

  const db = await supabaseServer();
  const [timeline, actions, quotes, policy, licenses, flags, threads, collab, documents, candidates] =
    await Promise.all([
      opportunityTimeline(id),
      actionsForOpportunity(id),
      quotesFor(id),
      activePolicy(),
      licensesForBrand(opportunity.brandId),
      getFlags(),
      threadsForOpportunity(id),
      db.from('collaboration').select('id, status').eq('opportunity_id', id).maybeSingle(),
      documentsFor(id),
      unlinkedDocumentsFor(opportunity.brandId),
    ]);

  const classified = timeline.find((e) => e.eventType === 'reply.classified');
  const facts = (classified?.payload ?? {}) as {
    replyTypes?: string[];
    riskFlags?: string[];
    paidUsageRequested?: boolean;
    usagePeriod?: string | null;
    cashAmountCents?: number | null;
    questions?: string[];
    uncertainties?: string[];
  };

  return (
    <>
      <div className="dashBar">
        <h1>{opportunity.brandName}</h1>
        <span className="osTag" data-tone={opportunity.stage === 'won' ? 'won' : opportunity.stage === 'lost' ? 'lost' : 'mute'}>
          {STAGE_LABEL[opportunity.stage]}
        </span>
        <Link className="chip" href={`/dashboard/brands/${opportunity.brandId}`}>
          Ver a marca
        </Link>
      </div>

      <div className="osStats">
        <div className="osStat">
          <b><em>{MODEL_LABEL[opportunity.commercialModel]}</em></b>
          <span>modelo</span>
        </div>
        <div className="osStat">
          {opportunity.expectedCashCents ? (
            <b>{formatMoney(opportunity.expectedCashCents)}</b>
          ) : (
            <b><em>—</em></b>
          )}
          <span>valor esperado</span>
        </div>
        <div className="osStat">
          <b><em>{opportunity.lastActivityAt ? relativeDays(opportunity.lastActivityAt) : '—'}</em></b>
          <span>última atividade</span>
        </div>
        <div className="osStat">
          <b>{opportunity.brandFitScore ?? '—'}</b>
          <span>fit da marca</span>
        </div>
      </div>

      {opportunity.waitingUntil ? (
        <p className="osWarn" data-tone="info">
          Em espera até {formatDate(opportunity.waitingUntil)}
          {opportunity.waitingReason ? ` — ${opportunity.waitingReason}` : ''}.
        </p>
      ) : null}

      {facts.riskFlags?.length ? (
        <p className="osWarn">
          Riscos comerciais detectados na conversa: {facts.riskFlags.join(', ')}.
          {facts.paidUsageRequested && !facts.usagePeriod
            ? ' Pediram anúncios pagos sem indicar duração — não fechar valor antes de saber.'
            : ''}
        </p>
      ) : null}

      {actions.length ? (
        <section className="osSection">
          <h2>O que falta fazer aqui</h2>
          <div className="osRows">
            {actions.map((a) => (
              <div className="osRow" key={a.id}>
                <div>
                  <span className="osRowName" style={{ fontSize: 17 }}>{a.title}</span>
                  <p className="osRowSub">{a.reason}</p>
                </div>
                <div className="osRowSide">
                  {a.dueAt ? <span>{relativeDays(a.dueAt)}</span> : null}
                  {a.risk !== 'none' ? <span className="osTag" data-tone="bad">{a.risk}</span> : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <StageControl
        opportunityId={id}
        stage={opportunity.stage}
        waitingUntil={opportunity.waitingUntil}
        waitingReason={opportunity.waitingReason}
        hasCollaboration={Boolean(collab.data)}
      />

      {collab.data ? (
        <p className="osWarn" data-tone="ok">
          A produção está aberta ({STATUS_LABEL[collab.data.status as CollaborationStatus] ?? collab.data.status}).{' '}
          <Link href={`/dashboard/production/${collab.data.id}`}>Abrir</Link>.
        </p>
      ) : null}

      <Copilot
        opportunityId={id}
        aiEnabled={flags.ai_enabled && flags.ai_drafting}
        gmailDraftEnabled={flags.gmail_draft_creation}
      />

      <QuoteBuilder opportunityId={id} quotes={quotes} policyVersion={policy.version} />

      <Documents opportunityId={id} documents={documents} candidates={candidates} />

      {opportunity.commercialModel === 'barter' ||
      opportunity.commercialModel === 'reimbursement' ||
      opportunity.commercialModel === 'unclear' ? (
        <BarterCheck cashAlternativeCents={quotes[0]?.finalCents ?? null} />
      ) : null}

      {licenses.length ? (
        <div className="osPanel">
          <h3>Direitos ativos desta marca</h3>
          <div className="osRows">
            {licenses.map((l) => (
              <div className="osRow" key={l.id}>
                <div>
                  <span className="osRowName" style={{ fontSize: 16 }}>
                    {l.scope.paidAllowed ? 'Uso pago' : 'Uso orgânico'}
                    {l.scope.platforms.length ? ` · ${l.scope.platforms.join(', ')}` : ''}
                  </span>
                  <p className="osRowSub">
                    {l.scope.endAt ? `Termina a ${formatDate(l.scope.endAt)}` : 'Sem data de fim registada'}
                    {l.scope.exclusivity ? ' · exclusividade' : ''}
                    {l.scope.whitelisting ? ' · whitelisting' : ''}
                  </p>
                </div>
                <div className="osRowSide">
                  <span className="osTag" data-tone={l.expiry.state === 'expired' ? 'bad' : l.expiry.state === 'expiring' ? 'hot' : 'ok'}>
                    {label('expiry', l.expiry.state)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {threads.length ? (
        <div className="osPanel">
          <h3>Conversas</h3>
          <div className="osRows">
            {threads.map((t) => (
              <div className="osRow" key={t.id}>
                <div>
                  <span className="osRowName" style={{ fontSize: 16 }}>{t.subject || '(sem assunto)'}</span>
                  <p className="osRowSub">{t.provider} · {t.message_count} mensagem(ns)</p>
                </div>
                <div className="osRowSide">
                  {t.last_message_at ? <span>{relativeDays(t.last_message_at)}</span> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <section className="osSection">
        <h2>História</h2>
        <p className="osNote">Tudo o que aconteceu, com origem e prova. Nada foi escrito à mão.</p>
        <Timeline entries={timeline} />
      </section>
    </>
  );
}
