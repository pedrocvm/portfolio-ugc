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
import Timeline from '@/components/dashboard/os/Timeline';

export const dynamic = 'force-dynamic';

/** O dossiê da relação. Abre com o estado comercial e a próxima ação, não com
 *  um formulário de edição. */
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
      db.from('contact').select('id, name, role, email, preferred_channel').eq('brand_id', id),
      db.from('relationship').select('*').eq('brand_id', id).maybeSingle(),
      latestDossier(id),
    ]);

  const { computed, effective } = brandFit(brand);
  const open = opportunities.filter((o) => o.stage !== 'won' && o.stage !== 'lost');
  const rel = relationship.data;

  return (
    <>
      <div className="dashBar">
        <h1>{brand.name}</h1>
        {brand.websiteUrl ? (
          <a className="chip" href={brand.websiteUrl} target="_blank" rel="noreferrer">Site</a>
        ) : null}
      </div>

      <div className="osStats">
        <div className="osStat">
          <b>{effective.score || '—'}</b>
          <span>fit{effective.overridden ? ' (corrigido)' : ''}</span>
        </div>
        <div className="osStat">
          <b>{open.length}</b>
          <span>oportunidades abertas</span>
        </div>
        <div className="osStat">
          {rel?.total_cash_cents ? <b>{formatMoney(rel.total_cash_cents)}</b> : <b><em>—</em></b>}
          <span>já pago em dinheiro</span>
        </div>
        <div className="osStat">
          {rel?.total_barter_cents ? <b>{formatMoney(rel.total_barter_cents)}</b> : <b><em>—</em></b>}
          <span>valor em permuta</span>
        </div>
      </div>

      {open.length === 0 && opportunities.length > 0 ? (
        <p className="osWarn" data-tone="info">
          Não há nenhuma oportunidade aberta com esta marca. Um trabalho aprovado costuma dar
          origem a outro — vale ver a história antes de a deixar arrefecer.
        </p>
      ) : null}

      <section className="osSection">
        <h2>Oportunidades</h2>
        {opportunities.length ? (
          <div className="osRows">
            {opportunities.map((o) => (
              <Link className="osRow" key={o.id} href={`/dashboard/opportunities/${o.id}`}>
                <div>
                  <span className="osRowName">{o.title || o.productName || 'Oportunidade'}</span>
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
        ) : (
          <p className="osEmpty">Ainda não há oportunidades registadas com esta marca.</p>
        )}
      </section>

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

      {(contacts.data ?? []).length ? (
        <div className="osPanel">
          <h3>Contatos</h3>
          <div className="osRows">
            {(contacts.data ?? []).map((c) => (
              <div className="osRow" key={c.id}>
                <div>
                  <span className="osRowName" style={{ fontSize: 17 }}>{c.name || c.email}</span>
                  <p className="osRowSub">{[c.role, c.email].filter(Boolean).join(' · ')}</p>
                </div>
                <div className="osRowSide">
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
        opportunityId={open[0]?.id ?? null}
        defaultProduct={open[0]?.productName ?? ''}
        aiEnabled={flags.ai_enabled && flags.ai_drafting}
        hypotheses={hypotheses}
      />

      {brand.notes ? (
        <div className="osPanel">
          <h3>Notas da ficha antiga</h3>
          <p className="osEventText" style={{ whiteSpace: 'pre-wrap' }}>{brand.notes}</p>
        </div>
      ) : null}

      <section className="osSection">
        <h2>História</h2>
        <Timeline entries={timeline} />
      </section>
    </>
  );
}
