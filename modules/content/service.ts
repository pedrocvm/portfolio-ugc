import 'server-only';

import { aiTaskEnabled, type Flags } from '@/lib/flags';
import { supabaseServer } from '@/lib/supabase/server';
import { recordEvent } from '@/modules/activity/service';
import { runPrompt } from '@/modules/ai/gateway';
import { creativeHypotheses } from '@/modules/ai/prompts/registry';
import { type ContentRow, type FunnelRole, type Shot } from './domain';

/** Inteligência criativa.
 *
 *  Conteúdo é uma hipótese criativa com uma função no funil, não um ficheiro.
 *  É essa diferença que permite vender um pacote de três como três razões
 *  distintas para o consumidor avançar, em vez de «três vídeos com desconto». */

export {
  CAPABILITIES, CAPABILITY_LABEL, FUNNEL_LABEL, FUNNEL_NOTE, FUNNEL_ROLES,
  shotListFromScript, type ContentRow, type FunnelRole, type Shot,
} from './domain';

const SELECT = `
  id, collaboration_id, brand_id, title, hypothesis, funnel_role, format, hook,
  core_message, cta, emotion, capabilities, language, script, shot_list, status,
  media_item_id, portfolio_permission, published_at, brand:brand_id ( name )
`;

type RawContent = {
  id: string; collaboration_id: string | null; brand_id: string | null; title: string;
  hypothesis: string; funnel_role: string | null; format: string; hook: string;
  core_message: string; cta: string; emotion: string; capabilities: string[] | null;
  language: string; script: string; shot_list: unknown; status: string;
  media_item_id: string | null; portfolio_permission: boolean | null;
  published_at: string | null; brand: { name: string } | null;
};

const toContent = (r: RawContent): ContentRow => ({
  id: r.id,
  collaborationId: r.collaboration_id,
  brandId: r.brand_id,
  brandName: r.brand?.name ?? '—',
  title: r.title,
  hypothesis: r.hypothesis,
  funnelRole: r.funnel_role as FunnelRole | null,
  format: r.format,
  hook: r.hook,
  coreMessage: r.core_message,
  cta: r.cta,
  emotion: r.emotion,
  capabilities: r.capabilities ?? [],
  language: r.language,
  script: r.script,
  shotList: (r.shot_list ?? []) as Shot[],
  status: r.status,
  mediaItemId: r.media_item_id,
  portfolioPermission: r.portfolio_permission,
  publishedAt: r.published_at,
});

export async function listContent(): Promise<ContentRow[]> {
  const db = await supabaseServer();
  const { data } = await db.from('content_asset').select(SELECT).order('created_at', { ascending: false });
  return ((data ?? []) as unknown as RawContent[]).map(toContent);
}

export async function contentFor(collaborationId: string): Promise<ContentRow[]> {
  const db = await supabaseServer();
  const { data } = await db
    .from('content_asset')
    .select(SELECT)
    .eq('collaboration_id', collaborationId)
    .order('created_at');
  return ((data ?? []) as unknown as RawContent[]).map(toContent);
}

/** O repertório que já existe. Serve para o gerador não repetir e para
 *  escolher o exemplo mais relevante quando uma marca pede portfólio. */
export async function capabilityInventory(): Promise<{ capability: string; count: number }[]> {
  const db = await supabaseServer();
  const { data } = await db.from('content_asset').select('capabilities');
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    for (const cap of row.capabilities ?? []) counts.set(cap, (counts.get(cap) ?? 0) + 1);
  }
  return [...counts].map(([capability, count]) => ({ capability, count })).sort((a, b) => b.count - a.count);
}

export async function saveContent(input: {
  id?: string;
  collaborationId?: string | null;
  brandId?: string | null;
  title: string;
  hypothesis?: string;
  funnelRole?: FunnelRole | null;
  format?: string;
  hook?: string;
  coreMessage?: string;
  cta?: string;
  emotion?: string;
  capabilities?: string[];
  language?: string;
  script?: string;
  status?: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const db = await supabaseServer();
  const row = {
    collaboration_id: input.collaborationId ?? null,
    brand_id: input.brandId ?? null,
    title: input.title,
    hypothesis: input.hypothesis ?? '',
    funnel_role: input.funnelRole ?? null,
    format: input.format ?? '',
    hook: input.hook ?? '',
    core_message: input.coreMessage ?? '',
    cta: input.cta ?? '',
    emotion: input.emotion ?? '',
    capabilities: input.capabilities ?? [],
    language: input.language ?? 'pt-BR',
    script: input.script ?? '',
    ...(input.status ? { status: input.status } : {}),
  };

  const { data, error } = input.id
    ? await db.from('content_asset').update(row).eq('id', input.id).select('id').maybeSingle()
    : await db.from('content_asset').insert(row).select('id').maybeSingle();

  if (error || !data) return { ok: false, error: 'Não foi possível guardar o conteúdo.' };
  return { ok: true, id: data.id };
}

export async function saveShotList(contentId: string, shots: Shot[]) {
  const db = await supabaseServer();
  await db.from('content_asset').update({ shot_list: shots as never }).eq('id', contentId);
}

export async function approveScript(contentId: string, actorUserId: string) {
  const db = await supabaseServer();
  const { data } = await db
    .from('content_asset')
    .update({ status: 'script_approved' })
    .eq('id', contentId)
    .select('brand_id, collaboration_id, title')
    .maybeSingle();

  if (!data) return;
  await recordEvent(db, {
    eventType: 'script.approved',
    brandId: data.brand_id,
    collaborationId: data.collaboration_id,
    actorType: 'carol',
    actorUserId,
    summary: `Roteiro aprovado: ${data.title}.`,
    payload: { contentId },
    dedupeKey: `content:${contentId}:script_approved`,
  });
}

export type HypothesisResult =
  | { ok: true; created: number }
  | { ok: false; code: string; message: string };

/** Gera hipóteses e guarda-as. Compara com o portfólio para não propor a
 *  quinta versão do mesmo formato — repertório novo é o que faz a peça
 *  seguinte valer mais do que a anterior. */
export async function generateHypotheses(input: {
  brandId: string;
  opportunityId?: string | null;
  product: string;
  objective: string;
  flags: Flags;
}): Promise<HypothesisResult> {
  if (!aiTaskEnabled(input.flags, 'ai_drafting')) {
    return { ok: false, code: 'flag_off', message: 'A bandeira ai_drafting está fechada.' };
  }

  const db = await supabaseServer();
  const [{ data: brand }, existing, { data: brief }] = await Promise.all([
    db.from('brand').select('name').eq('id', input.brandId).maybeSingle(),
    capabilityInventory(),
    db.from('brief').select('parsed').eq('opportunity_id', input.opportunityId ?? '')
      .order('version', { ascending: false }).limit(1).maybeSingle(),
  ]);

  const { data: portfolio } = await db
    .from('content_asset')
    .select('title, funnel_role, hook, format, capabilities')
    .limit(40);

  const result = await runPrompt(
    creativeHypotheses,
    {
      brandName: brand?.name ?? 'marca',
      product: input.product,
      objective: input.objective,
      portfolio: [
        ...(portfolio ?? []).map((c) => `${c.funnel_role ?? '—'} | ${c.format} | ${c.hook || c.title}`),
        `Competências já demonstradas: ${existing.map((c) => `${c.capability}×${c.count}`).join(', ')}`,
      ].join('\n'),
      brief: brief?.parsed ? JSON.stringify(brief.parsed) : '',
    },
    { entityType: 'brand', entityId: input.brandId },
  );

  if (!result.ok) return { ok: false, code: result.code, message: result.message };

  await db.from('creative_hypothesis').insert(
    result.output.hypotheses.map((h) => ({
      brand_id: input.brandId,
      opportunity_id: input.opportunityId ?? null,
      ai_run_id: result.runId,
      title: h.title,
      funnel_role: h.funnel_role,
      friction: h.friction,
      hook: h.hook,
      core_message: h.core_message,
      demonstration: h.demonstration,
      cta: h.cta,
      emotion: h.emotion,
      capabilities: h.capabilities,
      status: 'proposed',
    })),
  );

  return { ok: true, created: result.output.hypotheses.length };
}

export async function hypothesesFor(brandId: string) {
  const db = await supabaseServer();
  const { data } = await db
    .from('creative_hypothesis')
    .select('id, title, funnel_role, friction, hook, core_message, demonstration, cta, emotion, capabilities, status')
    .eq('brand_id', brandId)
    .order('created_at', { ascending: false });
  return data ?? [];
}

/** O exemplo de portfólio mais relevante para um lead. Categoria e idioma
 *  primeiro, competência depois. Mandar o portfólio inteiro é obrigar a marca
 *  a fazer o trabalho de encontrar a peça que responde à dúvida dela. */
export async function bestPortfolioExample(input: {
  nicheId: string | null;
  language?: string;
  capability?: string;
}): Promise<ContentRow | null> {
  const db = await supabaseServer();
  const { data } = await db
    .from('content_asset')
    .select(SELECT)
    .eq('status', 'approved')
    .not('media_item_id', 'is', null);

  const rows = ((data ?? []) as unknown as RawContent[]).map(toContent);
  if (!rows.length) return null;

  const score = (c: ContentRow) => {
    let s = 0;
    if (input.nicheId && c.capabilities.includes(input.nicheId)) s += 5;
    if (input.capability && c.capabilities.includes(input.capability)) s += 4;
    if (input.language && c.language === input.language) s += 3;
    if (c.funnelRole === 'CONSIDERATION') s += 1;
    return s;
  };

  return rows.sort((a, b) => score(b) - score(a))[0] ?? null;
}
