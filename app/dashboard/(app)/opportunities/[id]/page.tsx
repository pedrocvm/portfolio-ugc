import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { formatMoney } from '@/lib/money';
import { formatDate } from '@/lib/time';
import { label } from '@/lib/labels';
import { supabaseServer } from '@/lib/supabase/server';
import { opportunityTimeline } from '@/modules/activity/service';
import { MODEL_LABEL } from '@/modules/opportunities/domain';
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
import RelationshipHeader from '@/components/dashboard/os/RelationshipHeader';
import StageControl from '@/components/dashboard/os/StageControl';
import Timeline from '@/components/dashboard/os/Timeline';
import { describeRisks } from '@/modules/rights/engine';

export const dynamic = 'force-dynamic';

/** A bancada de um negócio, pela ordem das perguntas dela.
 *
 *    O que está acontecendo, e o que faço a seguir?   — o topo
 *    O que a marca disse?                             — a conversa
 *    Onde está o negócio?                             — etapa, valor, direitos
 *    E depois?                                        — produção
 *    O que aconteceu antes?                           — a história
 *
 *  Abria com quatro números — modelo, valor, última atividade, fit — e um
 *  formulário de etapa. Números que na maior parte dos negócios são um traço
 *  não são um resumo: são quatro formas de dizer que ainda não há nada. */
export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;

  const opportunity = await getOpportunity(id);
  if (!opportunity) notFound();

  const db = await supabaseServer();
  const [timeline, quotes, policy, licenses, flags, collab, documents, candidates] = await Promise.all([
    opportunityTimeline(id),
    quotesFor(id),
    activePolicy(),
    licensesForBrand(opportunity.brandId),
    getFlags(),
    db.from('collaboration').select('id, status').eq('opportunity_id', id).maybeSingle(),
    documentsFor(id),
    unlinkedDocumentsFor(opportunity.brandId),
  ]);

  const classified = timeline.find((e) => e.eventType === 'reply.classified');
  const facts = (classified?.payload ?? {}) as {
    riskFlags?: string[];
    paidUsageRequested?: boolean;
    usagePeriod?: string | null;
  };
  const riscos = describeRisks(facts.riskFlags ?? []);

  // Só o que já tem valor. Um traço não é informação.
  const resumo = [
    opportunity.commercialModel !== 'unclear' ? MODEL_LABEL[opportunity.commercialModel] : null,
    opportunity.expectedCashCents ? `${formatMoney(opportunity.expectedCashCents)} esperados` : null,
    typeof opportunity.brandFitScore === 'number' ? `fit ${opportunity.brandFitScore}` : null,
  ].filter(Boolean);

  return (
    <>
      <div className="dashBar">
        <h1>{opportunity.brandName}</h1>
        {resumo.length ? <span className="dashState">{resumo.join(' · ')}</span> : null}
        <Link className="chip" href={`/dashboard/brands/${opportunity.brandId}`}>
          Ver a marca
        </Link>
      </div>

      {opportunity.waitingUntil ? (
        <p className="osWarn" data-tone="info">
          Em espera até {formatDate(opportunity.waitingUntil)}
          {opportunity.waitingReason ? ` — ${opportunity.waitingReason}` : ''}.
        </p>
      ) : null}

      {riscos ? (
        <p className="osWarn">
          Riscos comerciais nesta conversa: {riscos}.
          {facts.paidUsageRequested && !facts.usagePeriod
            ? ' Pediram anúncios pagos sem dizer por quanto tempo — não fechar valor antes de saber.'
            : ''}
        </p>
      ) : null}

      <RelationshipHeader opportunityId={id} brandName={opportunity.brandName} stage={opportunity.stage} />

      <h2 className="osDivider">Negócio</h2>

      <StageControl
        opportunityId={id}
        stage={opportunity.stage}
        waitingUntil={opportunity.waitingUntil}
        waitingReason={opportunity.waitingReason}
        hasCollaboration={Boolean(collab.data)}
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

      {/* O copiloto fica atrás do trabalho já preparado: é para quando ela
          quer outra leitura, não a primeira. */}
      <details className="osRest">
        <summary>Pedir outra leitura à CarolAI</summary>
        <Copilot
          opportunityId={id}
          aiEnabled={flags.ai_enabled && flags.ai_drafting}
          gmailDraftEnabled={flags.gmail_draft_creation}
        />
      </details>

      {collab.data ? (
        <>
          <h2 className="osDivider">Produção</h2>
          <p className="osWarn" data-tone="ok">
            A produção está aberta ({STATUS_LABEL[collab.data.status as CollaborationStatus] ?? collab.data.status}).{' '}
            <Link href={`/dashboard/production/${collab.data.id}`}>Abrir</Link>.
          </p>
        </>
      ) : null}

      <section className="osSection">
        <h2>História</h2>
        <p className="osNote">O que foi dito à vista; o que o sistema anotou, dobrado. Nada foi escrito à mão.</p>
        <Timeline entries={timeline} />
      </section>
    </>
  );
}
