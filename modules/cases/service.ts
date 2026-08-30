import 'server-only';

import { updateTag } from 'next/cache';
import { MEDIA_TAG } from '@/lib/content-store';
import { supabaseServer } from '@/lib/supabase/server';
import { asJson } from '@/lib/supabase/json';
import { recordEvent, type Db } from '@/modules/activity/service';

/** Case, métricas e ponte para o portfólio.
 *
 *  Duas regras que este ficheiro existe para garantir:
 *   1. um projecto não acaba na entrega — acaba quando aprovação, pagamento,
 *      direitos, permissão, métricas e upsell estiverem avaliados;
 *   2. nada privado sai para o site sem permissão registada. O portfólio
 *      público lê `media_item` com nicho preenchido; um case só pode escrever
 *      lá quando a marca autorizou por escrito. */

export type CaseRow = {
  id: string;
  brandId: string;
  brandName: string;
  collaborationId: string | null;
  title: string;
  challenge: string;
  hypothesis: string;
  execution: string;
  result: string;
  missingMetrics: string[];
  capabilityTags: string[];
  permission: 'unknown' | 'requested' | 'granted' | 'denied';
  visibility: 'private' | 'public';
  publishedAt: string | null;
  createdAt: string;
};

const SELECT = `
  id, brand_id, collaboration_id, title, challenge, hypothesis, execution, result,
  missing_metrics, capability_tags, permission, visibility, published_at, created_at,
  brand:brand_id ( name )
`;

type RawCase = {
  id: string; brand_id: string; collaboration_id: string | null; title: string;
  challenge: string; hypothesis: string; execution: string; result: string;
  missing_metrics: string[] | null; capability_tags: string[] | null; permission: string;
  visibility: string; published_at: string | null; created_at: string;
  brand: { name: string } | null;
};

const toCase = (r: RawCase): CaseRow => ({
  id: r.id,
  brandId: r.brand_id,
  brandName: r.brand?.name ?? '—',
  collaborationId: r.collaboration_id,
  title: r.title,
  challenge: r.challenge,
  hypothesis: r.hypothesis,
  execution: r.execution,
  result: r.result,
  missingMetrics: r.missing_metrics ?? [],
  capabilityTags: r.capability_tags ?? [],
  permission: r.permission as CaseRow['permission'],
  visibility: r.visibility as CaseRow['visibility'],
  publishedAt: r.published_at,
  createdAt: r.created_at,
});

export async function listCases(): Promise<CaseRow[]> {
  const db = await supabaseServer();
  const { data } = await db.from('case_study').select(SELECT).order('created_at', { ascending: false });
  return ((data ?? []) as unknown as RawCase[]).map(toCase);
}

export async function getCase(id: string): Promise<CaseRow | null> {
  const db = await supabaseServer();
  const { data } = await db.from('case_study').select(SELECT).eq('id', id).maybeSingle();
  return data ? toCase(data as unknown as RawCase) : null;
}

/** Monta o rascunho do case a partir do que o sistema já sabe. A Carol edita;
 *  não reescreve do zero. Escrever um case à mão depois de cada entrega é
 *  exactamente o trabalho administrativo que ela não vai fazer. */
export async function draftCase(
  collaborationId: string,
  actorUserId: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const db = await supabaseServer();

  const { data: collab } = await db
    .from('collaboration')
    .select('id, brand_id, opportunity_id, title, compensation_model, brand:brand_id ( name )')
    .eq('id', collaborationId)
    .maybeSingle();
  if (!collab) return { ok: false, error: 'Colaboração não encontrada.' };

  const { data: existing } = await db
    .from('case_study')
    .select('id')
    .eq('collaboration_id', collaborationId)
    .maybeSingle();
  if (existing) return { ok: true, id: existing.id };

  const brand = collab.brand as unknown as { name: string } | null;

  const [{ data: content }, { data: brief }, { data: perf }, { data: rights }] = await Promise.all([
    db.from('content_asset').select('title, hypothesis, funnel_role, hook, core_message, capabilities')
      .eq('collaboration_id', collaborationId),
    db.from('brief').select('parsed').eq('collaboration_id', collaborationId)
      .order('version', { ascending: false }).limit(1).maybeSingle(),
    db.from('performance_snapshot').select('metrics, qualitative').eq('collaboration_id', collaborationId),
    db.from('rights_license').select('portfolio_permission').eq('collaboration_id', collaborationId).maybeSingle(),
  ]);

  const parsed = (brief?.parsed ?? {}) as { objective?: string; audience?: string };
  const hypotheses = (content ?? []).map((c) => c.hypothesis).filter(Boolean);
  const capabilities = [...new Set((content ?? []).flatMap((c) => c.capabilities ?? []))];

  const missing: string[] = [];
  if (!perf?.length) missing.push('Métricas de campanha');
  if (!parsed.objective) missing.push('Objetivo declarado pela marca');
  if (!hypotheses.length) missing.push('Hipótese criativa registada');

  const permission: CaseRow['permission'] = rights?.portfolio_permission === true
    ? 'granted'
    : rights?.portfolio_permission === false
      ? 'denied'
      : 'unknown';

  const { data, error } = await db
    .from('case_study')
    .insert({
      collaboration_id: collaborationId,
      brand_id: collab.brand_id,
      title: `${brand?.name ?? 'Marca'} · ${collab.title}`,
      challenge: parsed.objective ?? '',
      hypothesis: hypotheses.join('\n'),
      execution: (content ?? [])
        .map((c) => `${c.funnel_role ?? '—'}: ${c.hook || c.core_message || c.title}`)
        .join('\n'),
      result: (perf ?? []).map((p) => p.qualitative).filter(Boolean).join('\n'),
      missing_metrics: missing,
      capability_tags: capabilities,
      permission,
      visibility: 'private',
    })
    .select('id')
    .single();

  if (error || !data) return { ok: false, error: 'Não foi possível criar o case.' };

  await recordEvent(db, {
    eventType: 'case.created',
    brandId: collab.brand_id,
    opportunityId: collab.opportunity_id,
    collaborationId,
    actorType: 'carol',
    actorUserId,
    summary: missing.length
      ? `Case em rascunho. Falta: ${missing.join(', ')}.`
      : 'Case em rascunho, com tudo o que era preciso.',
    payload: { caseId: data.id, missing, permission },
    dedupeKey: `case:${data.id}:created`,
  });

  return { ok: true, id: data.id };
}

export async function recordMetrics(input: {
  collaborationId: string;
  brandId: string;
  contentAssetId?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  metrics: Record<string, number | string>;
  qualitative: string;
  actorUserId: string;
}) {
  const db = await supabaseServer();
  await db.from('performance_snapshot').insert({
    collaboration_id: input.collaborationId,
    content_asset_id: input.contentAssetId ?? null,
    brand_id: input.brandId,
    period_start: input.periodStart ?? null,
    period_end: input.periodEnd ?? null,
    metrics: input.metrics as never,
    qualitative: input.qualitative,
    source: 'brand',
  });

  await recordEvent(db, {
    eventType: 'metrics.received',
    brandId: input.brandId,
    collaborationId: input.collaborationId,
    actorType: 'brand',
    actorUserId: input.actorUserId,
    summary: 'Métricas recebidas da marca.',
    payload: { metrics: input.metrics },
  });
}

export async function requestMetrics(collaborationId: string, actorUserId: string) {
  const db = await supabaseServer();
  const { data } = await db
    .from('collaboration')
    .select('brand_id, opportunity_id')
    .eq('id', collaborationId)
    .maybeSingle();

  await recordEvent(db, {
    eventType: 'metrics.requested',
    brandId: data?.brand_id ?? null,
    opportunityId: data?.opportunity_id ?? null,
    collaborationId,
    actorType: 'carol',
    actorUserId,
    summary: 'Métricas pedidas à marca.',
    payload: {},
  });
}

export async function setPermission(
  caseId: string,
  permission: CaseRow['permission'],
  actorUserId: string,
) {
  const db = await supabaseServer();
  const { data } = await db
    .from('case_study')
    .update({ permission })
    .eq('id', caseId)
    .select('brand_id, collaboration_id')
    .maybeSingle();

  if (!data) return;
  await recordEvent(db, {
    eventType: 'case.created',
    brandId: data.brand_id,
    collaborationId: data.collaboration_id,
    actorType: 'carol',
    actorUserId,
    summary: `Permissão de portfólio: ${permission}.`,
    payload: { caseId, permission },
  });
}

export async function updateCase(
  caseId: string,
  patch: Partial<Pick<CaseRow, 'title' | 'challenge' | 'hypothesis' | 'execution' | 'result' | 'capabilityTags'>>,
) {
  const db = await supabaseServer();
  await db
    .from('case_study')
    .update({
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.challenge !== undefined ? { challenge: patch.challenge } : {}),
      ...(patch.hypothesis !== undefined ? { hypothesis: patch.hypothesis } : {}),
      ...(patch.execution !== undefined ? { execution: patch.execution } : {}),
      ...(patch.result !== undefined ? { result: patch.result } : {}),
      ...(patch.capabilityTags !== undefined ? { capability_tags: patch.capabilityTags } : {}),
    })
    .eq('id', caseId);
}

/** Publica no portfólio público reutilizando o caminho que já existe:
 *  `media_item` com nicho preenchido é o que o site lê. Sem duplicar tabelas
 *  e sem recadastrar metadados.
 *
 *  A permissão é verificada aqui, do lado do servidor. Um botão desactivado na
 *  interface não é controlo de acesso. */
export async function publishToPortfolio(input: {
  caseId: string;
  mediaItemIds: string[];
  niche: string;
  actorUserId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const db = await supabaseServer();
  const { data: study } = await db
    .from('case_study')
    .select('id, brand_id, collaboration_id, title, permission')
    .eq('id', input.caseId)
    .maybeSingle();

  if (!study) return { ok: false, error: 'Case não encontrado.' };
  if (study.permission !== 'granted') {
    return {
      ok: false,
      error: 'A marca ainda não autorizou por escrito. Sem permissão registada, nada vai para o site.',
    };
  }
  if (!input.niche.trim()) {
    return { ok: false, error: 'Escolhe o nicho: é o que faz o registo aparecer no site.' };
  }

  // O nicho preenchido é o que torna o media_item legível pelo público.
  await db
    .from('media_item')
    .update({ niche: input.niche })
    .in('id', input.mediaItemIds);

  await db
    .from('case_study')
    .update({
      visibility: 'public',
      published_at: new Date().toISOString(),
      media_item_ids: input.mediaItemIds,
    })
    .eq('id', input.caseId);

  await db
    .from('content_asset')
    .update({ published_at: new Date().toISOString() })
    .in('media_item_id', input.mediaItemIds);

  await recordEvent(db, {
    eventType: 'portfolio.published',
    brandId: study.brand_id,
    collaborationId: study.collaboration_id,
    actorType: 'carol',
    actorUserId: input.actorUserId,
    summary: `Publicado no portfólio: ${study.title}.`,
    payload: { caseId: input.caseId, mediaItemIds: input.mediaItemIds, niche: input.niche },
    dedupeKey: `case:${input.caseId}:published`,
  });

  updateTag(MEDIA_TAG);
  return { ok: true };
}

/** Retira do site sem apagar nada: o nicho vazio é exactamente o que o RLS
 *  público usa para não devolver a linha. */
export async function unpublishFromPortfolio(caseId: string) {
  const db = await supabaseServer();
  const { data } = await db
    .from('case_study')
    .select('media_item_ids')
    .eq('id', caseId)
    .maybeSingle();

  if (data?.media_item_ids?.length) {
    await db.from('media_item').update({ niche: '' }).in('id', data.media_item_ids);
  }
  await db.from('case_study').update({ visibility: 'private', published_at: null }).eq('id', caseId);
  updateTag(MEDIA_TAG);
}

/** Estado de encerramento. Um projecto só fecha quando todas as caixas estão
 *  respondidas — mesmo que a resposta seja «não se aplica». */
export type Closeout = {
  approved: boolean;
  paymentResolved: boolean;
  rightsRegistered: boolean;
  portfolioPermission: boolean;
  feedbackOrMetrics: boolean;
  upsellEvaluated: boolean;
  complete: boolean;
};

export async function closeoutStatus(collaborationId: string): Promise<Closeout> {
  const db = await supabaseServer();

  const [{ data: collab }, { data: payments }, { data: rights }, { data: perf }, { data: upsell }] =
    await Promise.all([
      db.from('collaboration').select('status, compensation_model').eq('id', collaborationId).maybeSingle(),
      db.from('payment').select('status, kind').eq('collaboration_id', collaborationId),
      db.from('rights_license').select('id, portfolio_permission').eq('collaboration_id', collaborationId),
      db.from('performance_snapshot').select('id').eq('collaboration_id', collaborationId),
      db.from('activity_event').select('id').eq('collaboration_id', collaborationId)
        .eq('event_type', 'upsell.created').limit(1),
    ]);

  const approved = collab?.status === 'approved' || collab?.status === 'closed';
  const paymentResolved =
    collab?.compensation_model === 'unpaid' ||
    (payments ?? []).length > 0 && (payments ?? []).every((p) => p.status === 'paid' || p.status === 'written_off');
  const rightsRegistered = (rights ?? []).length > 0;
  const portfolioPermission = (rights ?? []).some((r) => r.portfolio_permission !== null);
  const feedbackOrMetrics = (perf ?? []).length > 0;
  const upsellEvaluated = (upsell ?? []).length > 0;

  return {
    approved,
    paymentResolved,
    rightsRegistered,
    portfolioPermission,
    feedbackOrMetrics,
    upsellEvaluated,
    complete:
      approved && paymentResolved && rightsRegistered && portfolioPermission &&
      feedbackOrMetrics && upsellEvaluated,
  };
}

/** Pedidos de métricas em atraso.
 *
 *  Corre uma vez por dia. Uma campanha precisa de tempo para produzir números,
 *  por isso o pedido só aparece catorze dias depois da aprovação — pedir no
 *  dia seguinte é pedir a uma marca que ainda não tem nada para dar.
 *
 *  Sem métricas, uma entrega não vira prova comercial, e sem prova o preço da
 *  proposta seguinte é o mesmo da anterior. */
const METRICS_WAIT_DAYS = 14;

export async function requestPendingMetrics(db: Db): Promise<{ requested: number; skipped: number }> {
  const cutoff = new Date(Date.now() - METRICS_WAIT_DAYS * 86400000).toISOString();

  const { data: collaborations } = await db
    .from('collaboration')
    .select('id, brand_id, opportunity_id, title, closed_at, updated_at')
    .in('status', ['approved', 'closed'])
    .lte('updated_at', cutoff);

  let requested = 0;
  let skipped = 0;

  for (const c of collaborations ?? []) {
    const [{ count: metrics }, { data: alreadyAsked }] = await Promise.all([
      db.from('performance_snapshot').select('id', { count: 'exact', head: true })
        .eq('collaboration_id', c.id),
      db.from('action_item').select('id').eq('dedupe_key', `collab:${c.id}:metrics`).maybeSingle(),
    ]);

    if ((metrics ?? 0) > 0 || alreadyAsked) {
      skipped++;
      continue;
    }

    await db.from('action_item').upsert(
      {
        collaboration_id: c.id,
        brand_id: c.brand_id,
        opportunity_id: c.opportunity_id,
        type: 'request_metrics' as const,
        title: 'Pedir os resultados da campanha',
        reason:
          'A campanha já teve tempo de correr. Sem números, este trabalho não sobe o preço do próximo.',
        evidence: asJson({ collaborationId: c.id, waitedDays: METRICS_WAIT_DAYS }),
        risk: 'none' as const,
        priority_score: 40,
        status: 'open' as const,
        requires_approval: true,
        dedupe_key: `collab:${c.id}:metrics`,
      },
      { onConflict: 'dedupe_key' },
    );

    await recordEvent(db, {
      eventType: 'metrics.requested',
      brandId: c.brand_id,
      opportunityId: c.opportunity_id,
      collaborationId: c.id,
      actorType: 'system',
      summary: 'Lembrete criado: pedir métricas da campanha.',
      payload: { waitedDays: METRICS_WAIT_DAYS },
      dedupeKey: `collab:${c.id}:metrics-reminder`,
    });

    requested++;
  }

  return { requested, skipped };
}
