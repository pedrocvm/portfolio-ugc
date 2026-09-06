import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { formatMoney } from '@/lib/money';
import { formatDate, relativeDays } from '@/lib/time';
import { label } from '@/lib/labels';
import { supabaseServer } from '@/lib/supabase/server';
import { brandTimeline } from '@/modules/activity/service';
import { latestDossier } from '@/modules/brands/dossier';
import { brandFit, brandIdentities, getBrand } from '@/modules/brands/service';
import { hypothesesFor } from '@/modules/content/service';
import { STAGE_LABEL } from '@/modules/opportunities/domain';
import { opportunitiesForBrand } from '@/modules/opportunities/service';
import { licensesForBrand } from '@/modules/rights/service';
import { getFlags } from '@/modules/settings/service';
import FitPanel from '@/components/dashboard/os/FitPanel';
import CreativeIdeas from '@/components/dashboard/os/CreativeIdeas';
import Dossier from '@/components/dashboard/os/Dossier';
import RelationshipHeader from '@/components/dashboard/os/RelationshipHeader';
import Timeline from '@/components/dashboard/os/Timeline';

export const dynamic = 'force-dynamic';

/** A relação com uma marca, pela ordem das perguntas dela.
 *
 *  Abre com a situação, a próxima ação e o trabalho já preparado para o
 *  negócio em curso — e com a conversa à vista. O fit, o dossiê, as ideias e
 *  os direitos vêm depois: são contexto, e contexto não decide nada sozinho.
 *
 *  Sem números soltos no topo. «— · 1 · — · —» era o retrato de quase todas
 *  as marcas, e quatro traços não são um resumo. */
export default async function BrandPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;

  const brand = await getBrand(id);
  if (!brand) notFound();

  const db = await supabaseServer();
  const [opportunities, timeline, identities, licenses, hypotheses, flags, contacts, relationship, dossier] =
    await Promise.all([
      opportunitiesForBrand(id),
      brandTimeline(id),
      brandIdentities(id),
      licensesForBrand(id),
      hypothesesFor(id),
      getFlags(),
      db.from('contact').select('id, name, role, email, preferred_channel, provenance, source').eq('brand_id', id),
      db.from('relationship').select('*').eq('brand_id', id).maybeSingle(),
      latestDossier(id),
    ]);

  const { computed, effective } = brandFit(brand);
  const open = opportunities.filter((o) => o.stage !== 'won' && o.stage !== 'lost');
  const atual = open[0] ?? null;
  const rel = relationship.data;

  const resumo = [
    rel?.total_cash_cents ? `${formatMoney(rel.total_cash_cents)} já pagos` : null,
    rel?.total_barter_cents ? `${formatMoney(rel.total_barter_cents)} em permuta` : null,
    effective.score ? `fit ${effective.score}${effective.overridden ? ' (corrigido)' : ''}` : null,
  ].filter(Boolean);

  return (
    <>
      <div className="dashBar">
        <h1>{brand.name}</h1>
        {resumo.length ? <span className="dashState">{resumo.join(' · ')}</span> : null}
        {brand.websiteUrl ? (
          <a className="chip" href={brand.websiteUrl} target="_blank" rel="noreferrer">Site</a>
        ) : null}
      </div>

      {atual ? (
        <RelationshipHeader opportunityId={atual.id} brandName={brand.name} stage={atual.stage} />
      ) : (
        <section className="rel">
          <div className="relNow">
            <p className="relEyebrow">Situação agora</p>
            <p className="relLine">
              {opportunities.length
                ? 'Não há nenhum negócio aberto com esta marca. Um trabalho aprovado costuma dar origem a outro — vale ver a história antes de a deixar arrefecer.'
                : 'Ainda não há conversa nem negócio com esta marca.'}
            </p>
          </div>
        </section>
      )}

      {opportunities.length > 1 || (opportunities.length === 1 && !atual) ? (
        <section className="osSection">
          <h2>Negócios</h2>
          <div className="osRows">
            {opportunities.map((o) => (
              <Link className="osRow" key={o.id} href={`/dashboard/opportunities/${o.id}`}>
                <div>
                  <span className="osRowName">{o.title || o.productName || 'Negócio'}</span>
                  <p className="osRowSub">{o.nextActionText || '—'}</p>
                </div>
                <div className="osRowSide">
                  <span className="osTag" data-tone={o.stage === 'won' ? 'won' : o.stage === 'lost' ? 'lost' : 'mute'}>
                    {STAGE_LABEL[o.stage]}
                  </span>
                  {o.lastActivityAt ? <span>{relativeDays(o.lastActivityAt)}</span> : null}
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : atual ? (
        <p className="osNote">
          <Link href={`/dashboard/opportunities/${atual.id}`}>Abrir a bancada do negócio</Link> — etapa, valor,
          documentos e direitos.
        </p>
      ) : null}

      {(contacts.data ?? []).length ? (
        <div className="osPanel">
          <h3>Contatos</h3>
          <div className="osRows">
            {(contacts.data ?? []).map((c) => (
              <div className="osRow" key={c.id}>
                <div>
                  <span className="osRowName" style={{ fontSize: 17 }}>{c.name || c.email}</span>
                  <p className="osRowSub">{[c.role, c.email].filter(Boolean).join(' · ')}</p>
                  {c.provenance ? <p className="osRowSub">{c.provenance}</p> : null}
                </div>
                <div className="osRowSide">
                  {c.source === 'referral' ? <span className="osTag" data-tone="ok">indicado pela marca</span> : null}
                  {c.preferred_channel ? (
                    <span className="osTag" data-tone="mute">
                      {label('channel', c.preferred_channel)}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <h2 className="osDivider">Contexto</h2>

      <Dossier
        brandId={id}
        dossier={dossier}
        generatedAt={brand.dossierAt}
        aiEnabled={flags.ai_enabled && flags.ai_classification}
      />

      <FitPanel
        brandId={id}
        nicheId={brand.categoryPrimary}
        score={brand.fitScore}
        band={brand.fitBand}
        lines={computed.lines}
        policyVersion={brand.fitPolicyVersion}
        override={brand.fitOverride}
      />

      {licenses.length ? (
        <div className="osPanel">
          <h3>Direitos</h3>
          <div className="osRows">
            {licenses.map((l) => (
              <div className="osRow" key={l.id}>
                <div>
                  <span className="osRowName" style={{ fontSize: 16 }}>
                    {l.scope.paidAllowed ? 'Uso pago' : 'Uso orgânico'}
                  </span>
                  <p className="osRowSub">
                    {l.scope.platforms.join(', ') || 'canais não indicados'}
                    {l.scope.endAt ? ` · até ${formatDate(l.scope.endAt)}` : ' · sem data de fim'}
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

      <CreativeIdeas
        brandId={id}
        opportunityId={atual?.id ?? null}
        defaultProduct={atual?.productName ?? ''}
        aiEnabled={flags.ai_enabled && flags.ai_drafting}
        hypotheses={hypotheses}
      />

      {identities.length || brand.notes ? (
        <details className="osRest">
          <summary>Identidades e notas antigas</summary>
          {identities.length ? (
            <div className="osPanel">
              <h3>Identidades</h3>
              <p className="osNote">
                É por aqui que o sistema reconhece a mesma empresa vinda de canais diferentes. Só funde
                por identificador — nunca por nome parecido.
              </p>
              <div className="osMeta">
                {identities.map((i) => (
                  <span key={i.id} className="osTag" data-tone={i.verified ? 'ok' : 'mute'}>
                    {i.provider}: {i.external_id}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {brand.notes ? (
            <div className="osPanel">
              <h3>Notas da ficha antiga</h3>
              <p className="osEventText" style={{ whiteSpace: 'pre-wrap' }}>{brand.notes}</p>
            </div>
          ) : null}
        </details>
      ) : null}

      <section className="osSection">
        <h2>História</h2>
        <Timeline entries={timeline} />
      </section>
    </>
  );
}
