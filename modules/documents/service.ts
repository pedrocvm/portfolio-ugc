import 'server-only';

import { asJson } from '@/lib/supabase/json';
import { supabaseServer } from '@/lib/supabase/server';
import { recordEvent } from '@/modules/activity/service';
import { PROPOSAL_BLANK, USAGE_BLANK, type DocKind } from '@/lib/documents';
import { USAGE_TERM_DAYS, USAGE_TERM_LABEL, type UsageTerm } from '@/modules/pricing/engine';

/** Ponte entre o CarolOS e o motor de documentos que já existia.
 *
 *  O motor não foi reescrito: continua salvando JSON por template e a
 *  renderizar da mesma forma. O que muda é que uma proposta passa a nascer da
 *  oportunidade e do orçamento — com o escopo, o valor e os direitos já lá
 *  dentro — em vez de ser reconstruída à mão a partir da memória.
 *
 *  Reconstruir à mão é onde a Carol se engana: escreve um valor que já não é o
 *  do orçamento, ou esquece o período de uso que negociou. */

export type LinkedDocument = {
  id: string;
  kind: DocKind;
  title: string;
  status: string;
  version: number;
  sentAt: string | null;
  linkSource: string | null;
  createdAt: string;
};

export async function documentsFor(opportunityId: string): Promise<LinkedDocument[]> {
  const db = await supabaseServer();
  const { data } = await db
    .from('document')
    .select('id, kind, title, status, version, sent_at, link_source, created_at')
    .eq('opportunity_id', opportunityId)
    .order('created_at', { ascending: false });

  return (data ?? []).map((d) => ({
    id: d.id,
    kind: d.kind as DocKind,
    title: d.title,
    status: d.status,
    version: d.version,
    sentAt: d.sent_at,
    linkSource: d.link_source,
    createdAt: d.created_at,
  }));
}

/** Documentos da mesma marca ainda sem oportunidade. Candidatos a ligar à mão:
 *  o backfill só ligou os que batiam exatamente, de propósito. */
export async function unlinkedDocumentsFor(brandId: string): Promise<LinkedDocument[]> {
  const db = await supabaseServer();
  const { data } = await db
    .from('document')
    .select('id, kind, title, status, version, sent_at, link_source, created_at')
    .eq('brand_id', brandId)
    .is('opportunity_id', null);

  return (data ?? []).map((d) => ({
    id: d.id,
    kind: d.kind as DocKind,
    title: d.title,
    status: d.status,
    version: d.version,
    sentAt: d.sent_at,
    linkSource: d.link_source,
    createdAt: d.created_at,
  }));
}

export async function linkDocument(
  documentId: string,
  opportunityId: string,
  actorUserId: string,
): Promise<{ ok: boolean; error?: string }> {
  const db = await supabaseServer();
  const { data: opp } = await db
    .from('opportunity')
    .select('brand_id')
    .eq('id', opportunityId)
    .maybeSingle();
  if (!opp) return { ok: false, error: 'Oportunidade não encontrada.' };

  const { error } = await db
    .from('document')
    .update({ opportunity_id: opportunityId, brand_id: opp.brand_id, link_source: 'manual', link_confidence: 1 })
    .eq('id', documentId);
  if (error) return { ok: false, error: 'Não foi possível ligar o documento.' };

  await recordEvent(db, {
    eventType: 'proposal.revised',
    brandId: opp.brand_id,
    opportunityId,
    actorType: 'carol',
    actorUserId,
    summary: 'Documento ligado a esta oportunidade.',
    payload: { documentId },
    dedupeKey: `document:${documentId}:linked:${opportunityId}`,
  });
  return { ok: true };
}

const euros = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');

/** Cria uma proposta já preenchida. Tudo o que vem preenchido vem de dados
 *  estruturados — nada é inventado, e o que não se sabe fica com o valor
 *  neutro do template para a Carol completar. */
export async function proposalFromOpportunity(
  opportunityId: string,
  actorUserId: string,
): Promise<{ ok: boolean; id?: string; error?: string; warnings?: string[] }> {
  const db = await supabaseServer();

  const { data: opp } = await db
    .from('opportunity')
    .select('id, brand_id, title, product_name, currency, brand:brand_id ( name )')
    .eq('id', opportunityId)
    .maybeSingle();
  if (!opp) return { ok: false, error: 'Oportunidade não encontrada.' };

  const brand = opp.brand as unknown as { name: string } | null;

  const [{ data: quote }, { data: contact }, { data: license }] = await Promise.all([
    db.from('quote').select('*').eq('opportunity_id', opportunityId)
      .order('version', { ascending: false }).limit(1).maybeSingle(),
    db.from('contact').select('name, email').eq('brand_id', opp.brand_id)
      .not('email', 'is', null).limit(1).maybeSingle(),
    db.from('rights_license').select('*').eq('opportunity_id', opportunityId).maybeSingle(),
  ]);

  const warnings: string[] = [];
  if (!quote) warnings.push('Não há orçamento nesta oportunidade: o valor fica por preencher.');
  if (quote?.unresolved?.length) {
    warnings.push(`O orçamento tem ${quote.unresolved.length} item(ns) por resolver na política.`);
  }

  const scope = (quote?.input_scope ?? {}) as {
    videos?: number;
    paidUsage?: boolean;
    usageTerm?: UsageTerm | null;
    platforms?: string[];
    rawFootage?: boolean;
  };

  const videos = scope.videos ?? 1;
  const deliverables = [
    `${videos} vídeo${videos > 1 ? 's' : ''} UGC em formato vertical`,
    'Uma ronda de comentários sobre a primeira versão',
    ...(scope.rawFootage ? ['Arquivos em bruto'] : []),
  ].join('\n');

  // Os direitos vêm do escopo do orçamento, escritos por extenso. É aqui que a
  // separação entre produção e licença aparece na proposta.
  const usage = scope.paidUsage && scope.usageTerm
    ? `Uso orgânico nas redes da marca, sem limite de tempo.`
    : 'Uso orgânico nas redes da marca, sem limite de tempo.';

  const ads = scope.paidUsage
    ? scope.usageTerm
      ? `Direitos para anúncios pagos incluídos por ${USAGE_TERM_LABEL[scope.usageTerm]}` +
        (scope.platforms?.length ? `, em ${scope.platforms.join(' e ')}.` : '.') +
        ' A contagem começa no primeiro dia em que o vídeo corre como anúncio.'
      : 'Direitos para anúncios pagos por definir: falta acordar período e canais. ' +
        'A licença é orçamentada à parte da produção.'
    : 'Direitos para anúncios pagos não incluídos. Orçamentados à parte, por período e canais.';

  const data: Record<string, unknown> = {
    ...PROPOSAL_BLANK,
    brand: brand?.name ?? '',
    contactName: contact?.name ?? '',
    contactEmail: contact?.email ?? '',
    date: new Date().toISOString().slice(0, 10),
    packageName: opp.product_name || opp.title || '',
    deliverables,
    price: quote?.final_cents ? euros(quote.final_cents) : '',
    usage,
    ads,
  };

  const { data: created, error } = await db
    .from('document')
    .insert({
      kind: 'proposal',
      title: brand?.name ?? 'Proposta',
      data: asJson(data),
      brand_id: opp.brand_id,
      opportunity_id: opportunityId,
      quote_id: quote?.id ?? null,
      link_source: 'manual',
      link_confidence: 1,
      status: 'draft',
    })
    .select('id')
    .single();

  if (error || !created) return { ok: false, error: 'Não foi possível criar a proposta.' };

  if (license) {
    await db.from('rights_license').update({ document_id: created.id }).eq('id', license.id);
  }

  await recordEvent(db, {
    eventType: 'proposal.revised',
    brandId: opp.brand_id,
    opportunityId,
    actorType: 'carol',
    actorUserId,
    summary: quote
      ? `Proposta preparada a partir do orçamento v${quote.version}.`
      : 'Proposta preparada a partir da oportunidade, sem orçamento associado.',
    payload: { documentId: created.id, quoteId: quote?.id ?? null, warnings },
    dedupeKey: `document:${created.id}:created`,
  });

  return { ok: true, id: created.id, warnings };
}

/** Marcar como enviada move a oportunidade e regista o evento. É o que faz o
 *  follow-up de proposta arrancar sozinho. */
export async function markDocumentSent(
  documentId: string,
  actorUserId: string,
): Promise<{ ok: boolean; error?: string }> {
  const db = await supabaseServer();
  const { data: doc } = await db
    .from('document')
    .select('id, kind, brand_id, opportunity_id, quote_id, title')
    .eq('id', documentId)
    .maybeSingle();
  if (!doc) return { ok: false, error: 'Documento não encontrado.' };

  const sentAt = new Date().toISOString();
  await db.from('document').update({ status: 'sent', sent_at: sentAt }).eq('id', documentId);
  if (doc.quote_id) {
    await db.from('quote').update({ status: 'sent', sent_at: sentAt }).eq('id', doc.quote_id);
  }

  const eventType = doc.kind === 'proposal' ? 'proposal.sent' : 'rights.started';

  await recordEvent(db, {
    eventType,
    occurredAt: sentAt,
    brandId: doc.brand_id,
    opportunityId: doc.opportunity_id,
    actorType: 'carol',
    actorUserId,
    summary: `${doc.kind === 'proposal' ? 'Proposta' : 'Documento'} enviado: ${doc.title}.`,
    payload: { documentId, quoteId: doc.quote_id },
    dedupeKey: `document:${documentId}:sent`,
  });

  if (doc.opportunity_id) {
    const { applyStageSignal } = await import('@/modules/opportunities/service');
    const { scheduleFor } = await import('@/modules/followups/service');
    const { replanActions } = await import('@/modules/actions/service');

    await applyStageSignal(
      db,
      doc.opportunity_id,
      { eventType: 'proposal.sent' },
      { autoApply: true, occurredAt: sentAt },
    );
    await scheduleFor(db, {
      opportunityId: doc.opportunity_id,
      brandId: doc.brand_id,
      eventType: 'proposal.sent',
      occurredAt: new Date(sentAt),
    });
    await replanActions(db, [doc.opportunity_id]);
  }

  return { ok: true };
}

/** Autorização de uso a partir de uma licença registada, para o documento
 *  legal dizer exatamente o que a licença diz. */
export async function usageDocFromLicense(
  licenseId: string,
  actorUserId: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const db = await supabaseServer();
  const { data: license } = await db
    .from('rights_license')
    .select('*, brand:brand_id ( name )')
    .eq('id', licenseId)
    .maybeSingle();
  if (!license) return { ok: false, error: 'Licença não encontrada.' };

  const brand = license.brand as unknown as { name: string } | null;
  const days = license.duration_days ??
    (license.start_at && license.end_at
      ? Math.round((Date.parse(license.end_at) - Date.parse(license.start_at)) / 86400000)
      : null);

  if (!days) {
    return {
      ok: false,
      error: 'A licença não tem duração. Uma autorização sem prazo é perpetuidade por padrão.',
    };
  }

  const data = {
    ...USAGE_BLANK,
    brand: brand?.name ?? '',
    date: new Date().toISOString().slice(0, 10),
    days: String(days),
    channels: (license.platforms ?? []).join('\n'),
    fee: license.fee_cents ? euros(license.fee_cents) : '',
    deliveredOn: license.start_at ?? '',
  };

  const { data: created, error } = await db
    .from('document')
    .insert({
      kind: 'usage',
      title: brand?.name ?? 'Autorização',
      data: asJson(data),
      brand_id: license.brand_id,
      opportunity_id: license.opportunity_id,
      collaboration_id: license.collaboration_id,
      link_source: 'manual',
      link_confidence: 1,
      status: 'draft',
    })
    .select('id')
    .single();

  if (error || !created) return { ok: false, error: 'Não foi possível criar a autorização.' };

  await db.from('rights_license').update({ document_id: created.id }).eq('id', licenseId);

  await recordEvent(db, {
    eventType: 'rights.started',
    brandId: license.brand_id,
    opportunityId: license.opportunity_id,
    collaborationId: license.collaboration_id,
    actorType: 'carol',
    actorUserId,
    summary: `Autorização de uso preparada a partir da licença (${days} dias).`,
    payload: { documentId: created.id, licenseId },
    dedupeKey: `license:${licenseId}:document`,
  });

  return { ok: true, id: created.id };
}

export { USAGE_TERM_DAYS };
