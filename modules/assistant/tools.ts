import 'server-only';

import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase/server';
import { STAGE_LABEL, type Stage } from '@/modules/opportunities/domain';
import { previewQuote, activePolicy } from '@/modules/pricing/service';
import type { Source } from './domain';

/** As ferramentas do Carol AI.
 *
 *  A regra que decide o que é ferramenta e o que é RAG: estado do negócio
 *  pergunta-se à base, conhecimento documental procura-se no texto. «Quando
 *  falei com a Cecotec?» é uma consulta, não uma busca semântica.
 *
 *  Tudo corre no servidor, com a sessão da Carol e portanto com RLS. O modelo
 *  nunca vê SQL: recebe argumentos validados e devolve-se-lhe JSON. */

export type ToolContext = {
  entity: { type: string; id: string | null } | null;
};

export type ToolResult = { data: unknown; sources: Source[] };

/** O que uma ferramenta pode fazer ao mundo.
 *
 *  `read`   lê. Corre sempre, sem perguntar.
 *  `write`  muda alguma coisa cá dentro, e desfaz-se. Corre quando ela pede.
 *  `high`   sai para fora, mexe em dinheiro, ou não se desfaz.
 *
 *  As `high` não estão registadas e não podem correr por aqui. O modelo prepara
 *  e mostra; quem envia é ela, num botão. É a regra 3 do CarolOS, e a forma de
 *  a garantir é não existir caminho — não é lembrar-se de a verificar. */
export type ToolRisk = 'read' | 'write' | 'high';

export type Tool = {
  name: string;
  description: string;
  risk: ToolRisk;
  input: z.ZodType;
  run: (args: never, ctx: ToolContext) => Promise<ToolResult>;
};

/** Limite do lado do servidor. O modelo pede o que quiser; leva o que cabe. */
const cap = (n: number | undefined, max = 25) => Math.min(Math.max(n ?? 10, 1), max);

const brandSource = (b: { id: string; name: string }): Source => ({
  id: b.id, type: 'brand', label: b.name, at: null, href: `/dashboard/brands/${b.id}`,
});

const oppSource = (o: { id: string; brandName?: string | null }): Source => ({
  id: o.id, type: 'opportunity', label: o.brandName ?? 'Oportunidade', at: null,
  href: `/dashboard/opportunities/${o.id}`,
});

function define<S extends z.ZodType>(
  name: string,
  description: string,
  input: S,
  run: (args: z.infer<S>, ctx: ToolContext) => Promise<ToolResult>,
  risk: ToolRisk = 'read',
): Tool {
  return { name, description, risk, input, run: run as Tool['run'] };
}

/* ── Marcas e relação ────────────────────────────────────────────────────── */

const searchBrands = define(
  'search_brands',
  'Procura marcas no CRM por nome, nicho ou etapa do funil. Usa isto antes de assumir que uma marca existe.',
  z.object({
    query: z.string().optional().describe('parte do nome da marca'),
    stage: z.string().optional().describe('etapa do funil'),
    limit: z.number().optional(),
  }),
  async ({ query, stage, limit }) => {
    const db = await supabaseServer();
    let q = db
      .from('brand')
      .select('id, name, website_url, category_primary, category_tags, fit_score, fit_band, last_activity_at, opportunity:opportunity ( id, stage )')
      .order('last_activity_at', { ascending: false, nullsFirst: false })
      .limit(cap(limit));
    if (query) q = q.ilike('name', `%${query}%`);
    const { data, error } = await q;
    if (error) throw new Error(`search_brands: ${error.message}`);

    let rows = data ?? [];
    if (stage) {
      rows = rows.filter((b) =>
        (b.opportunity as { stage: string }[] | null)?.some((o) => o.stage === stage),
      );
    }

    return {
      data: rows.map((b) => ({
        id: b.id,
        name: b.name,
        website: b.website_url,
        category: b.category_primary,
        tags: b.category_tags,
        fitScore: b.fit_score,
        fitBand: b.fit_band,
        lastActivityAt: b.last_activity_at,
        stages: (b.opportunity as { stage: string }[] | null)?.map((o) => o.stage) ?? [],
      })),
      sources: rows.map((b) => brandSource(b)),
    };
  },
);

const getBrand = define(
  'get_brand',
  'O dossier completo de uma marca: contatos, oportunidades, últimas atividades, direitos e trabalhos. Usa isto para «o que sabemos sobre X».',
  z.object({ brand_id: z.string().uuid() }),
  async ({ brand_id }) => {
    const db = await supabaseServer();
    const [brand, contacts, opps, events] = await Promise.all([
      db.from('brand').select('id, name, website_url, category_primary, category_tags, fit_score, fit_band, fit_breakdown, notes, last_activity_at, created_at').eq('id', brand_id).maybeSingle(),
      db.from('contact').select('id, name, email, role').eq('brand_id', brand_id).limit(10),
      db.from('opportunity').select('id, title, stage, commercial_model, expected_cash_cents, barter_value_to_carol_cents, next_action_text, last_activity_at, waiting_until').eq('brand_id', brand_id),
      db.from('activity_event').select('event_type, summary, occurred_at').eq('brand_id', brand_id).order('occurred_at', { ascending: false }).limit(15),
    ]);

    if (!brand.data) return { data: { found: false }, sources: [] };

    return {
      data: {
        found: true,
        brand: {
          id: brand.data.id, name: brand.data.name, website: brand.data.website_url,
          category: brand.data.category_primary, tags: brand.data.category_tags,
          fitScore: brand.data.fit_score, fitBand: brand.data.fit_band,
          fitBreakdown: brand.data.fit_breakdown, notes: brand.data.notes,
          firstSeen: brand.data.created_at, lastActivityAt: brand.data.last_activity_at,
        },
        contacts: contacts.data ?? [],
        opportunities: (opps.data ?? []).map((o) => ({
          id: o.id, title: o.title, stage: o.stage,
          stageLabel: STAGE_LABEL[o.stage as Stage] ?? o.stage,
          model: o.commercial_model,
          expectedCashCents: o.expected_cash_cents,
          barterValueCents: o.barter_value_to_carol_cents,
          nextAction: o.next_action_text,
          lastActivityAt: o.last_activity_at, waitingUntil: o.waiting_until,
        })),
        recentActivity: (events.data ?? []).map((e) => ({
          type: e.event_type, summary: e.summary, at: e.occurred_at,
        })),
      },
      sources: [brandSource(brand.data), ...(opps.data ?? []).map((o) => oppSource({ id: o.id, brandName: brand.data!.name }))],
    };
  },
);

const getBrandActivity = define(
  'get_brand_activity',
  'A cronologia de eventos de uma marca. Responde a «quando falei com X pela última vez?» sem procurar em documentos.',
  z.object({ brand_id: z.string().uuid(), limit: z.number().optional() }),
  async ({ brand_id, limit }) => {
    const db = await supabaseServer();
    const { data } = await db
      .from('activity_event')
      .select('event_type, summary, occurred_at, channel, actor_type')
      .eq('brand_id', brand_id)
      .order('occurred_at', { ascending: false })
      .limit(cap(limit, 40));
    return {
      data: (data ?? []).map((e) => ({ type: e.event_type, summary: e.summary, at: e.occurred_at, channel: e.channel, actor: e.actor_type })),
      sources: [],
    };
  },
);

/* ── Oportunidades ───────────────────────────────────────────────────────── */

const searchOpportunities = define(
  'search_opportunities',
  'Lista oportunidades por etapa, ou as que estão paradas há N dias. Usa isto para «o que está parado» e «quais são tech».',
  z.object({
    stage: z.string().optional(),
    stale_days: z.number().optional().describe('só as sem atividade há mais dias do que isto'),
    limit: z.number().optional(),
  }),
  async ({ stage, stale_days, limit }) => {
    const db = await supabaseServer();
    let q = db
      .from('opportunity')
      .select('id, title, stage, commercial_model, expected_cash_cents, next_action_text, last_activity_at, waiting_until, brand:brand_id ( id, name, category_primary, fit_score )')
      .not('stage', 'in', '(won,lost)')
      .order('last_activity_at', { ascending: true, nullsFirst: true })
      .limit(cap(limit, 40));
    if (stage) q = q.eq('stage', stage);
    if (stale_days) {
      const cut = new Date(Date.now() - stale_days * 86400000).toISOString();
      q = q.or(`last_activity_at.is.null,last_activity_at.lte.${cut}`);
    }
    const { data, error } = await q;
    if (error) throw new Error(`search_opportunities: ${error.message}`);

    const rows = (data ?? []).map((o) => {
      const b = o.brand as { id: string; name: string; category_primary: string | null; fit_score: number | null } | null;
      return {
        id: o.id, title: o.title, stage: o.stage,
        stageLabel: STAGE_LABEL[o.stage as Stage] ?? o.stage,
        model: o.commercial_model,
        brandId: b?.id ?? null, brandName: b?.name ?? null,
        category: b?.category_primary ?? null, fitScore: b?.fit_score ?? null,
        expectedCashCents: o.expected_cash_cents, nextAction: o.next_action_text,
        lastActivityAt: o.last_activity_at, waitingUntil: o.waiting_until,
      };
    });
    return { data: rows, sources: rows.map((o) => oppSource({ id: o.id, brandName: o.brandName })) };
  },
);

const getOpportunity = define(
  'get_opportunity',
  'Uma oportunidade em detalhe, com orçamentos, direitos e a conversa associada.',
  z.object({ opportunity_id: z.string().uuid() }),
  async ({ opportunity_id }) => {
    const db = await supabaseServer();
    const [opp, quotes, rights, threads] = await Promise.all([
      db.from('opportunity').select('id, title, stage, commercial_model, expected_cash_cents, barter_value_to_carol_cents, product_name, next_action_text, next_action_due_at, last_activity_at, waiting_until, waiting_reason, brand:brand_id ( id, name, fit_score, category_primary )').eq('id', opportunity_id).maybeSingle(),
      db.from('quote').select('id, status, policy_version, created_at').eq('opportunity_id', opportunity_id).order('created_at', { ascending: false }).limit(5),
      db.from('rights_license').select('id, status, organic_allowed, paid_allowed, start_at, end_at, platforms').eq('opportunity_id', opportunity_id),
      db.from('source_thread').select('id, subject, last_message_at, message_count').eq('opportunity_id', opportunity_id).order('last_message_at', { ascending: false }).limit(3),
    ]);
    if (!opp.data) return { data: { found: false }, sources: [] };
    const b = opp.data.brand as { id: string; name: string } | null;
    return {
      data: {
        found: true,
        opportunity: {
          id: opp.data.id, title: opp.data.title, stage: opp.data.stage,
          stageLabel: STAGE_LABEL[opp.data.stage as Stage] ?? opp.data.stage,
          model: opp.data.commercial_model,
          brandName: b?.name ?? null,
          expectedCashCents: opp.data.expected_cash_cents,
          barterValueCents: opp.data.barter_value_to_carol_cents,
          productName: opp.data.product_name,
          nextAction: opp.data.next_action_text,
          nextActionDueAt: opp.data.next_action_due_at,
          waitingUntil: opp.data.waiting_until, waitingReason: opp.data.waiting_reason,
        },
        quotes: quotes.data ?? [],
        rights: rights.data ?? [],
        threads: threads.data ?? [],
      },
      sources: [
        oppSource({ id: opportunity_id, brandName: b?.name }),
        ...(b ? [brandSource(b)] : []),
      ],
    };
  },
);

/* ── Fila e follow-ups ───────────────────────────────────────────────────── */

const getTodayActions = define(
  'get_today_actions',
  'A fila do dia: o que precisa da atenção dela agora, por ordem de prioridade.',
  z.object({ limit: z.number().optional() }),
  async ({ limit }) => {
    const db = await supabaseServer();
    const now = new Date().toISOString();
    const { data } = await db
      .from('action_item')
      .select('id, type, title, reason, due_at, risk, priority_score, opportunity_id, brand:brand_id ( id, name )')
      .eq('status', 'open')
      .or(`snoozed_until.is.null,snoozed_until.lte.${now}`)
      .order('priority_score', { ascending: false })
      .limit(cap(limit, 40));
    const rows = (data ?? []).map((a) => {
      const b = a.brand as { id: string; name: string } | null;
      return { id: a.id, type: a.type, title: a.title, reason: a.reason, dueAt: a.due_at, risk: a.risk, brandName: b?.name ?? null, opportunityId: a.opportunity_id };
    });
    return { data: rows, sources: [] };
  },
);

const getFollowups = define(
  'get_followups',
  'Follow-ups agendados ou vencidos. Responde a «quem devo cobrar hoje» e «quem não respondeu».',
  z.object({ only_due: z.boolean().optional(), limit: z.number().optional() }),
  async ({ only_due, limit }) => {
    const db = await supabaseServer();
    let q = db
      .from('follow_up')
      .select('id, situation, due_at, status, sequence_index, brand:brand_id ( id, name ), opportunity_id')
      .in('status', ['scheduled', 'due'])
      .order('due_at', { ascending: true })
      .limit(cap(limit, 40));
    if (only_due) q = q.lte('due_at', new Date().toISOString());
    const { data } = await q;
    const rows = (data ?? []).map((f) => {
      const b = f.brand as { id: string; name: string } | null;
      return { id: f.id, situation: f.situation, dueAt: f.due_at, status: f.status, sequence: f.sequence_index, brandName: b?.name ?? null, opportunityId: f.opportunity_id };
    });
    return {
      data: rows,
      sources: rows.filter((r) => r.brandName).map((r) => ({
        id: r.id, type: 'followup' as const, label: `Follow-up · ${r.brandName}`, at: r.dueAt,
        href: r.opportunityId ? `/dashboard/opportunities/${r.opportunityId}` : '/dashboard/followups',
      })),
    };
  },
);

/* ── Email ───────────────────────────────────────────────────────────────── */

const searchEmails = define(
  'search_emails',
  'Procura mensagens de email já ingeridas, por marca, remetente, assunto ou texto. Nunca devolve a caixa toda.',
  z.object({
    brand_id: z.string().uuid().optional(),
    query: z.string().optional().describe('texto no assunto ou no corpo'),
    after: z.string().optional().describe('data ISO'),
    limit: z.number().optional(),
  }),
  async ({ brand_id, query, after, limit }) => {
    const db = await supabaseServer();
    let threads = db.from('source_thread').select('id').limit(50);
    if (brand_id) threads = threads.eq('brand_id', brand_id);
    const { data: ids } = await threads;
    const threadIds = (ids ?? []).map((t) => t.id);
    if (brand_id && threadIds.length === 0) return { data: [], sources: [] };

    let q = db
      .from('source_message')
      .select('id, thread_id, direction, sent_at, from_address, from_name, subject, snippet')
      .order('sent_at', { ascending: false })
      .limit(cap(limit, 25));
    if (brand_id) q = q.in('thread_id', threadIds);
    if (after) q = q.gte('sent_at', after);
    if (query) q = q.or(`subject.ilike.%${query}%,body_text.ilike.%${query}%`);

    const { data, error } = await q;
    if (error) throw new Error(`search_emails: ${error.message}`);
    const rows = data ?? [];
    return {
      data: rows.map((m) => ({
        id: m.id, threadId: m.thread_id, direction: m.direction, sentAt: m.sent_at,
        from: m.from_name || m.from_address, subject: m.subject, snippet: m.snippet,
      })),
      sources: rows.map((m) => ({
        id: m.thread_id, type: 'email' as const,
        label: `${m.from_name || m.from_address} · ${m.subject || 'sem assunto'}`,
        at: m.sent_at, href: '/dashboard/inbox',
      })),
    };
  },
);

const getEmailThread = define(
  'get_email_thread',
  'O corpo completo de uma conversa de email. Usa isto antes de escrever qualquer resposta.',
  z.object({ thread_id: z.string().uuid() }),
  async ({ thread_id }) => {
    const db = await supabaseServer();
    const { data } = await db
      .from('source_message')
      .select('direction, sent_at, from_address, from_name, subject, body_text')
      .eq('thread_id', thread_id)
      .order('sent_at', { ascending: true })
      .limit(30);
    return {
      data: (data ?? []).map((m) => ({
        direction: m.direction, sentAt: m.sent_at, from: m.from_name || m.from_address,
        subject: m.subject,
        // O corpo é conteúdo de terceiros. Vai como dado, e o system prompt diz
        // ao modelo que instruções aqui dentro não valem nada.
        body: (m.body_text ?? '').slice(0, 4000),
      })),
      sources: [{ id: thread_id, type: 'email' as const, label: 'Conversa de email', at: null, href: '/dashboard/inbox' }],
    };
  },
);

/* ── Dinheiro ────────────────────────────────────────────────────────────── */

const calculatePrice = define(
  'calculate_price',
  'Calcula um valor com o motor determinístico do CarolOS. NUNCA inventes um preço: chama isto. Devolve linhas, mínimo, recomendado e o que falta decidir.',
  z.object({
    videos: z.number().optional(),
    extraHooks: z.number().optional(),
    rawFootage: z.boolean().optional(),
    rush: z.boolean().optional(),
    paidUsage: z.boolean().optional(),
    usageMonths: z.number().optional(),
    exclusivityMonths: z.number().optional(),
    whitelisting: z.boolean().optional(),
  }),
  async (scope) => {
    const result = await previewQuote(scope);
    return {
      data: result,
      sources: [{ id: result.policyVersion, type: 'pricing' as const, label: `Política de preço ${result.policyVersion}`, at: null, href: '/dashboard/settings' }],
    };
  },
);

const getPricingPolicy = define(
  'get_pricing_policy',
  'A política de preço em vigor, com a versão e o que ainda está por decidir.',
  z.object({}),
  async () => {
    const p = await activePolicy();
    return {
      data: { version: p.version, status: p.status, rules: p.rules, notes: p.notes },
      sources: [{ id: p.version, type: 'pricing' as const, label: `Política de preço ${p.version}`, at: null, href: '/dashboard/settings' }],
    };
  },
);

const getRevenueSummary = define(
  'get_revenue_summary',
  'Agregados de dinheiro: recebido, por receber, permutas. Responde a «quanto já faturei».',
  z.object({ since: z.string().optional().describe('data ISO') }),
  async ({ since }) => {
    const db = await supabaseServer();
    let q = db.from('payment').select('kind, status, amount_cents, due_at, paid_at, brand:brand_id ( name )');
    if (since) q = q.gte('due_at', since);
    const { data } = await q;
    const rows = data ?? [];
    const sum = (f: (r: (typeof rows)[number]) => boolean) =>
      rows.filter(f).reduce((t, r) => t + (r.amount_cents ?? 0), 0);
    return {
      data: {
        currency: 'EUR',
        // Cêntimos inteiros: dinheiro nunca em vírgula flutuante.
        paidCents: sum((r) => r.status === 'paid' && r.kind === 'cash'),
        dueCents: sum((r) => r.status === 'due' && r.kind === 'cash'),
        invoicedCents: sum((r) => r.status === 'invoiced' && r.kind === 'cash'),
        barterCount: rows.filter((r) => r.kind === 'barter').length,
        count: rows.length,
      },
      sources: [{ id: 'revenue', type: 'case' as const, label: 'Receita', at: null, href: '/dashboard/revenue' }],
    };
  },
);

/* ── Portfólio, conteúdo e documentos ────────────────────────────────────── */

const searchPortfolio = define(
  'search_portfolio',
  'Procura no portfólio e nos conteúdos produzidos, por nicho, idioma ou formato. Usa isto para escolher que vídeo enviar a uma marca.',
  z.object({ query: z.string().optional(), limit: z.number().optional() }),
  async ({ query, limit }) => {
    const db = await supabaseServer();
    let q = db
      .from('content_asset')
      .select('id, title, format, language, status, hook, funnel_role, capabilities, portfolio_permission, collaboration_id')
      .order('created_at', { ascending: false })
      .limit(cap(limit));
    if (query) q = q.or(`title.ilike.%${query}%,hook.ilike.%${query}%`);
    const { data } = await q;
    const rows = data ?? [];
    return {
      data: rows,
      sources: rows.map((c) => ({ id: c.id, type: 'portfolio' as const, label: c.title || 'conteúdo', at: null, href: '/dashboard/content' })),
    };
  },
);

const searchDocuments = define(
  'search_documents',
  'Propostas, contratos e acordos de utilização salvos no CarolOS.',
  z.object({ query: z.string().optional(), brand_id: z.string().uuid().optional(), limit: z.number().optional() }),
  async ({ query, brand_id, limit }) => {
    const db = await supabaseServer();
    let q = db.from('document').select('id, kind, title, status, version, created_at, brand_id').order('created_at', { ascending: false }).limit(cap(limit));
    if (brand_id) q = q.eq('brand_id', brand_id);
    if (query) q = q.ilike('title', `%${query}%`);
    const { data } = await q;
    const rows = data ?? [];
    return {
      data: rows,
      sources: rows.map((d) => ({ id: d.id, type: 'document' as const, label: d.title || d.kind, at: d.created_at, href: `/dashboard/documents` })),
    };
  },
);

const getRights = define(
  'get_rights',
  'Licenças de uso: escopo, canais, início e fim. Usa isto para «quando expira o usage de X».',
  z.object({ brand_id: z.string().uuid().optional(), expiring_days: z.number().optional() }),
  async ({ brand_id, expiring_days }) => {
    const db = await supabaseServer();
    let q = db.from('rights_license').select('id, status, organic_allowed, paid_allowed, platforms, territories, start_at, end_at, whitelisting, exclusivity, raw_footage, opportunity_id, brand:brand_id ( id, name )').order('end_at', { ascending: true, nullsFirst: false }).limit(25);
    if (brand_id) q = q.eq('brand_id', brand_id);
    if (expiring_days) {
      const until = new Date(Date.now() + expiring_days * 86400000).toISOString();
      q = q.lte('end_at', until).eq('status', 'active');
    }
    const { data } = await q;
    const rows = (data ?? []).map((r) => {
      const b = r.brand as { id: string; name: string } | null;
      return {
        id: r.id, brandName: b?.name ?? null, status: r.status,
        organic: r.organic_allowed, paid: r.paid_allowed,
        platforms: r.platforms, territories: r.territories,
        startAt: r.start_at, endAt: r.end_at,
        whitelisting: r.whitelisting, exclusivity: r.exclusivity, rawFootage: r.raw_footage,
      };
    });
    return { data: rows, sources: [] };
  },
);

/* ── Memória e conhecimento ──────────────────────────────────────────────── */

const searchBusinessMemory = define(
  'search_business_memory',
  'As preferências, objetivos e decisões que a Carol já declarou. Consulta isto antes de recomendar seja o que for.',
  z.object({ type: z.string().optional(), query: z.string().optional() }),
  async ({ type, query }) => {
    const db = await supabaseServer();
    let q = db.from('business_memory').select('id, type, subject, content, status, effective_from').eq('status', 'active').order('effective_from', { ascending: false }).limit(25);
    if (type) q = q.eq('type', type);
    if (query) q = q.ilike('content', `%${query}%`);
    const { data } = await q;
    const rows = data ?? [];
    return {
      data: rows,
      sources: rows.map((m) => ({ id: m.id, type: 'memory' as const, label: `Memória · ${m.type}`, at: m.effective_from, href: null })),
    };
  },
);

const searchKnowledge = define(
  'search_knowledge',
  'Procura nos documentos canónicos (briefings, handoff, políticas) por texto integral. Usa isto para conhecimento documental, não para estado do negócio.',
  z.object({ query: z.string().min(2), limit: z.number().optional() }),
  async ({ query, limit }) => {
    const db = await supabaseServer();
    const { data, error } = await db
      .from('knowledge_chunk')
      .select('id, heading, content, ordinal, source:source_id ( id, title, source_type, version, authority )')
      .textSearch('search', query, { type: 'websearch', config: 'portuguese' })
      .limit(cap(limit, 12));
    if (error) throw new Error(`search_knowledge: ${error.message}`);
    const rows = data ?? [];
    return {
      data: rows.map((c) => {
        const s = c.source as { id: string; title: string; source_type: string; version: string; authority: number } | null;
        return { heading: c.heading, excerpt: c.content.slice(0, 1200), source: s?.title ?? null, version: s?.version ?? null, authority: s?.authority ?? null };
      }),
      sources: rows.map((c) => {
        const s = c.source as { id: string; title: string; version: string } | null;
        return { id: s?.id ?? c.id, type: 'knowledge' as const, label: `${s?.title ?? 'Documento'} ${s?.version ?? ''}`.trim(), at: null, href: null };
      }),
    };
  },
);

const createMemoryCandidate = define(
  'create_memory_candidate',
  'Regista uma preferência ou decisão que a Carol acabou de declarar. Fica como proposta: nada de comercial muda sem ela confirmar.',
  z.object({
    type: z.enum(['preference', 'goal', 'policy', 'pricing_decision', 'brand_preference', 'content_preference', 'workflow', 'constraint', 'strategy', 'other']),
    subject: z.string().max(120).optional(),
    content: z.string().min(4).max(600),
  }),
  async ({ type, subject, content }) => {
    const db = await supabaseServer();
    const { data: me } = await db.from('app_user').select('id').limit(1).maybeSingle();
    if (!me) throw new Error('create_memory_candidate: sem usuário');
    // Preço e política nunca entram ativos: esperam por uma pessoa.
    const status = type === 'pricing_decision' || type === 'policy' ? 'proposed' : 'active';
    const { data, error } = await db
      .from('business_memory')
      .insert({ app_user_id: me.id, type, subject: subject ?? '', content, status, source: 'conversation' })
      .select('id, status')
      .maybeSingle();
    if (error) throw new Error(`create_memory_candidate: ${error.message}`);
    return { data: { id: data?.id, status: data?.status, needsConfirmetion: status === 'proposed' }, sources: [] };
  },
  'write',
);


/* ── Instagram, com a honestidade do que existe ──────────────────────────── */

const getInstagramContext = define(
  'get_instagram_context',
  'O que o CarolOS tem do Instagram de uma marca. NÃO há integração com a API do Instagram: isto é só o que a Carol capturou à mão. Diz sempre há quanto tempo foi capturado.',
  z.object({ brand_id: z.string().uuid().optional(), query: z.string().optional() }),
  async ({ brand_id, query }) => {
    const db = await supabaseServer();
    let q = db
      .from('capture_item')
      .select('id, kind, raw_input, note, extracted, created_at, brand_id')
      .in('kind', ['profile', 'conversation', 'screenshot'])
      .order('created_at', { ascending: false })
      .limit(12);
    if (brand_id) q = q.eq('brand_id', brand_id);
    if (query) q = q.or(`raw_input.ilike.%${query}%,note.ilike.%${query}%`);

    const { data } = await q;
    const rows = data ?? [];

    // Um dado do Instagram sem data é uma afirmação sobre o passado disfarçada
    // de presente. A idade vai sempre junto.
    const now = Date.now();
    return {
      data: {
        integration: 'none',
        note: 'Não existe ligação à API do Instagram. Isto é captura manual do CarolOS.',
        items: rows.map((c) => ({
          kind: c.kind,
          note: c.note,
          content: (c.raw_input ?? '').slice(0, 1500),
          extracted: c.extracted,
          capturedAt: c.created_at,
          ageDays: Math.floor((now - new Date(c.created_at).getTime()) / 86400000),
        })),
      },
      sources: rows.map((c) => ({
        id: c.id, type: 'knowledge' as const,
        label: `Captura · ${c.kind}`, at: c.created_at, href: '/dashboard/capture',
      })),
    };
  },
);

/* ── Escrita: preparar, nunca disparar ───────────────────────────────────── */

const createFollowupDraft = define(
  'create_followup_draft',
  'Escreve o texto de um follow-up já agendado. Salva como rascunho — não envia nada.',
  z.object({ followup_id: z.string().uuid(), text: z.string().min(10).max(4000) }),
  async ({ followup_id, text }) => {
    const db = await supabaseServer();
    const { error } = await db.from('follow_up').update({ draft_text: text }).eq('id', followup_id);
    if (error) throw new Error(`create_followup_draft: ${error.message}`);
    return {
      data: { saved: true, sent: false, note: 'Rascunho salvo. O envio passa por ela.' },
      sources: [{ id: followup_id, type: 'followup' as const, label: 'Follow-up', at: null, href: '/dashboard/followups' }],
    };
  },
  'write',
);

const createNote = define(
  'create_note',
  'Deixa uma nota no registro de atividade de uma marca ou oportunidade, para não se perder o que se concluiu.',
  z.object({
    brand_id: z.string().uuid().optional(),
    opportunity_id: z.string().uuid().optional(),
    summary: z.string().min(4).max(400),
  }),
  async ({ brand_id, opportunity_id, summary }) => {
    if (!brand_id && !opportunity_id) throw new Error('create_note: indica a marca ou a oportunidade');
    const db = await supabaseServer();
    const { error } = await db.from('activity_event').insert({
      event_type: 'note.added',
      actor_type: 'system',
      brand_id: brand_id ?? null,
      opportunity_id: opportunity_id ?? null,
      summary,
      payload: { via: 'carol-ai' },
    });
    if (error) throw new Error(`create_note: ${error.message}`);
    return { data: { saved: true }, sources: [] };
  },
  'write',
);

const snoozeFollowupTool = define(
  'snooze_followup',
  'Adia um follow-up por alguns dias, quando a Carol disser que ainda não é altura.',
  z.object({ followup_id: z.string().uuid(), days: z.number().int().min(1).max(60) }),
  async ({ followup_id, days }) => {
    const db = await supabaseServer();
    const due = new Date(Date.now() + days * 86400000).toISOString();
    const { error } = await db
      .from('follow_up')
      .update({ due_at: due, status: 'scheduled' })
      .eq('id', followup_id);
    if (error) throw new Error(`snooze_followup: ${error.message}`);
    return { data: { dueAt: due }, sources: [] };
  },
  'write',
);

const getInsights = define(
  'get_insights',
  'Os avisos proativos abertos: oportunidades paradas, licenças a expirar, dinheiro por receber, janelas de upsell.',
  z.object({ limit: z.number().optional() }),
  async ({ limit }) => {
    const db = await supabaseServer();
    const { data } = await db
      .from('assistant_insight')
      .select('id, kind, severity, title, detail, href, created_at')
      .eq('status', 'open')
      .order('severity')
      .limit(cap(limit, 20));
    const rows = data ?? [];
    return {
      data: rows,
      sources: rows.filter((r) => r.href).map((r) => ({
        id: r.id, type: 'followup' as const, label: r.title.slice(0, 60), at: r.created_at, href: r.href,
      })),
    };
  },
);


/* ── Prospeção diária ───────────────────────────────────────────────────── */

const getDailyOutreach = define(
  'get_daily_outreach_batch',
  'As marcas que a prospeção encontrou hoje, com encaixe, porquê, contato e o email preparado.',
  z.object({ niche: z.string().optional(), limit: z.number().optional() }),
  async ({ niche, limit }) => {
    const db = await supabaseServer();
    const { data: run } = await db
      .from('outreach_run')
      .select('id, run_date, status, selected')
      .order('run_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!run) return { data: { found: false, note: 'Ainda não correu nenhuma prospeção.' }, sources: [] };

    let q = db
      .from('outreach_candidate')
      .select('id, name, website, country, niche_id, fit_score, product, why_fit, why_may_pay, risk, paid_media_signal, ugc_signal, creative_opportunity, contact_email, email_confidence, subject, status')
      .eq('run_id', run.id)
      .not('status', 'in', '(rejected,skipped)')
      .order('rank')
      .limit(cap(limit, 12));
    if (niche) q = q.eq('niche_id', niche);

    const { data } = await q;
    const rows = data ?? [];
    return {
      data: { found: true, runDate: run.run_date, count: rows.length, candidates: rows },
      sources: rows.map((c) => ({
        id: c.id, type: 'brand' as const, label: c.name, at: run.run_date, href: '/dashboard/outreach',
      })),
    };
  },
);

const getOutreachCandidate = define(
  'get_outreach_candidate',
  'Uma candidata em detalhe: pesquisa completa, ideias, fontes e o email por inteiro.',
  z.object({ candidate_id: z.string().uuid() }),
  async ({ candidate_id }) => {
    const db = await supabaseServer();
    const { data } = await db.from('outreach_candidate').select('*').eq('id', candidate_id).maybeSingle();
    if (!data) return { data: { found: false }, sources: [] };
    return {
      data: { found: true, ...data },
      sources: [{ id: data.id, type: 'brand' as const, label: data.name, at: null, href: '/dashboard/outreach' }],
    };
  },
);

const updateOutreachDraftTool = define(
  'update_outreach_draft',
  'Reescreve o assunto ou o corpo de uma abordagem. Salva; não envia.',
  z.object({
    candidate_id: z.string().uuid(),
    subject: z.string().min(3).max(200).optional(),
    body: z.string().min(40).max(6000).optional(),
  }),
  async ({ candidate_id, subject, body }) => {
    const db = await supabaseServer();
    const { error } = await db
      .from('outreach_candidate')
      .update({
        status: 'edited',
        ...(subject ? { subject: subject.trim() } : {}),
        ...(body ? { body: body.trim() } : {}),
      })
      .eq('id', candidate_id);
    if (error) throw new Error(`update_outreach_draft: ${error.message}`);
    return { data: { saved: true, sent: false, note: 'Salvo. O envio continua passando por ela.' }, sources: [] };
  },
  'write',
);

const approveOutreachTool = define(
  'approve_outreach',
  'Marca uma abordagem como aprovada. Aprovar não envia: o envio é um segundo passo, e é dela.',
  z.object({ candidate_id: z.string().uuid() }),
  async ({ candidate_id }) => {
    const db = await supabaseServer();
    const { error } = await db.from('outreach_candidate').update({ status: 'approved' }).eq('id', candidate_id);
    if (error) throw new Error(`approve_outreach: ${error.message}`);
    return { data: { approved: true, sent: false }, sources: [] };
  },
  'write',
);

const prepareOutreachSend = define(
  'prepare_outreach_send',
  'Verifica se uma abordagem está pronta a sair e devolve exatamente o que sairia. NÃO envia — o envio é sempre uma ação da Carol na interface.',
  z.object({ candidate_id: z.string().uuid() }),
  async ({ candidate_id }) => {
    const db = await supabaseServer();
    const { data } = await db
      .from('outreach_candidate')
      .select('name, contact_email, subject, body, status, email_confidence, quality')
      .eq('id', candidate_id)
      .maybeSingle();
    if (!data) return { data: { ready: false, reason: 'Não encontrei essa candidata.' }, sources: [] };

    const { validateSend } = await import('@/modules/outreach/send');
    const problem = validateSend({
      to: data.contact_email, subject: data.subject, body: data.body, status: data.status,
    });

    return {
      data: {
        ready: !problem,
        reason: problem,
        to: data.contact_email,
        subject: data.subject,
        body: data.body,
        emailConfidence: data.email_confidence,
        note: 'Nada foi enviado. Para enviar, ela clica em Enviar na tela de Prospeção.',
      },
      sources: [],
    };
  },
);

/* ── Operar o CarolOS ────────────────────────────────────────────────────── */

/** Daqui para baixo, a Carol AI deixa de ser só consultiva.
 *
 *  Tudo o que está aqui é reversível e fica cá dentro: começar uma busca,
 *  mudar o foco, adiar um cartão, salvar uma captura. Nada disto sai para
 *  fora nem fecha um negócio — essas continuam sendo dela, num botão. */

const startProspecting = define(
  'start_prospecting',
  'Começa uma busca de marcas com um pedido concreto («hotéis de luxo no Porto»). A busca demora minutos e corre em segundo plano; responde logo. Não envia nada a ninguém.',
  z.object({
    query: z.string().min(2).describe('o que procurar, em linguagem normal'),
    country: z.string().optional().describe('país; por omissão Portugal'),
  }),
  async ({ query, country }) => {
    const { startManualSearch } = await import('@/app/dashboard/outreach-actions');
    const r = await startManualSearch(query, country ?? 'Portugal');
    return {
      data: r.error
        ? { started: false, reason: r.error }
        : {
            started: true,
            query,
            country: country ?? 'Portugal',
            note: 'A busca está correndo. Os resultados aparecem na Prospeção, com o email já escrito para as que passarem o corte. Nada sai sem ela aprovar.',
          },
      sources: [],
    };
  },
  'write',
);

const readProspectingFocus = define(
  'get_prospecting_focus',
  'Mostra a configuração da busca automática: que nichos procura, em que países, e quantas marcas por dia.',
  z.object({}),
  async () => {
    const { getFocus } = await import('@/app/dashboard/outreach-actions');
    const focus = await getFocus();
    return { data: focus, sources: [] };
  },
);

const setProspectingFocus = define(
  'set_prospecting_focus',
  'Muda a busca automática: nichos, países e quantas por dia. Substitui a configuração inteira, por isso lê primeiro com get_prospecting_focus e devolve a lista completa que deve ficar. Reversível.',
  z.object({
    niches: z
      .array(z.object({ label: z.string(), notes: z.string().optional() }))
      .optional()
      .describe('os nichos a procurar, com o que olhar dentro de cada um'),
    countries: z.array(z.string()).optional(),
    perDay: z.number().int().min(1).max(50).optional(),
  }),
  async (input) => {
    const { getFocus, saveFocus } = await import('@/app/dashboard/outreach-actions');
    const { nicheIdFor } = await import('@/modules/outreach/focus');
    const atual = await getFocus();

    // O que ela já tinha marcado como favorito continua favorito: o modelo
    // recebe rótulos e notas, não a preferência dela sobre a ordem.
    const favoritos = new Set(atual.niches.filter((n) => n.favourite).map((n) => n.id));
    const niches = input.niches
      ? input.niches.map((n) => ({
          id: nicheIdFor(n.label),
          label: n.label,
          favourite: favoritos.has(nicheIdFor(n.label)),
          note: n.notes,
        }))
      : atual.niches;

    const r = await saveFocus({
      niches,
      countries: input.countries ?? atual.countries,
      perDay: input.perDay ?? atual.perDay,
    });
    return {
      data: r.error
        ? { saved: false, reason: r.error }
        : {
            saved: true,
            focus: { niches, countries: input.countries ?? atual.countries, perDay: input.perDay ?? atual.perDay },
            note: 'A próxima busca automática já usa isto.',
          },
      sources: [],
    };
  },
  'write',
);

const resolveTodayAction = define(
  'resolve_today_action',
  'Fecha ou adia um cartão da fila do Hoje. «done» quando ela já tratou do assunto; «snooze» com dias para voltar mais tarde. Desfaz-se.',
  z.object({
    action_id: z.string().uuid(),
    decision: z.enum(['done', 'snooze']),
    days: z.number().int().min(1).max(60).optional().describe('só para snooze; por omissão 3'),
  }),
  async ({ action_id, decision, days }) => {
    const { doneAction, snooze } = await import('@/app/dashboard/carolos-actions');
    const r = decision === 'done' ? await doneAction(action_id) : await snooze(action_id, days ?? 3);
    return {
      data: r.error
        ? { ok: false, reason: r.error }
        : {
            ok: true,
            decision,
            note:
              decision === 'done'
                ? 'Saiu da fila. Se o assunto voltar a mexer, o cartão volta.'
                : `Volta daqui a ${days ?? 3} dias.`,
          },
      sources: [],
    };
  },
  'write',
);

const captureSomething = define(
  'capture_something',
  'Salva um link, uma conversa colada, um briefing ou uma nota para o CarolOS processar. O tipo é detectado sozinho.',
  z.object({
    content: z.string().min(2).describe('o texto ou o endereço'),
    note: z.string().optional().describe('contexto que ela tenha dado'),
  }),
  async ({ content, note }) => {
    const { detectKind } = await import('@/modules/capture/detect');
    const { capture } = await import('@/app/dashboard/carolos-actions');
    const palpite = detectKind(content);
    const r = await capture(palpite.kind, content, note ?? '');
    return {
      data: r.error
        ? { saved: false, reason: r.error }
        : { saved: true, understoodAs: palpite.label, note: 'Salvo. Aparece na Captura quando estiver processado.' },
      sources: [],
    };
  },
  'write',
);

const findAnything = define(
  'find_anything',
  'Procura em tudo ao mesmo tempo: marcas, negócios, pessoas, documentos e conteúdo. Usa isto quando ela nomeia alguma coisa e não se sabe onde vive.',
  z.object({ query: z.string().min(2) }),
  async ({ query }) => {
    const { searchEverything } = await import('@/app/dashboard/search-actions');
    const hits = await searchEverything(query);
    // As fontes são citadas com o tipo que a interface já sabe desenhar. Um
    // tipo novo só para isto obrigava a mexer no desenho da citação para não
    // ganhar nada: o que interessa é o link.
    return {
      data: { hits },
      sources: hits.slice(0, 8).map((h) => ({
        id: h.id,
        type: h.group === 'Marcas' ? ('brand' as const) : ('document' as const),
        label: h.label,
        at: null,
        href: h.href,
      })),
    };
  },
);


/* ── Morning Autopilot ───────────────────────────────────────────────────── */

const getMorningBrief = define(
  'get_morning_brief',
  'A manhã já preparada: quantas decisões precisam dela, por que ordem, quanto tempo custam, o que o CarolOS fez sozinho e o que não conseguiu fazer. Usa isto para «organiza a minha manhã» e «o que preciso de fazer hoje».',
  z.object({}),
  async () => {
    const { readMorningBrief } = await import('@/modules/morning/service');
    const brief = await readMorningBrief();
    if (!brief) {
      return {
        data: {
          ready: false,
          note: 'A manhã de hoje ainda não foi consolidada. Isso acontece quando o trabalho das 07:10 não correu — não quer dizer que não haja nada a fazer.',
        },
        sources: [],
      };
    }
    return {
      data: {
        ready: true,
        status: brief.status,
        headline: brief.headline,
        estimatedMinutes: brief.estimatedMinutes,
        decisions: brief.decisions.map((d) => ({
          id: d.id,
          kind: d.kind,
          subject: d.subject,
          headline: d.headline,
          because: d.because,
          covers: d.covers,
          href: d.href,
        })),
        // O que ele fez, e o que não conseguiu. As duas coisas, sempre.
        prepared: brief.preparedLines,
        gaps: brief.gaps.map((g) => g.message),
      },
      sources: [{ id: brief.date, type: 'followup' as const, label: 'A manhã de hoje', at: null, href: '/dashboard' }],
    };
  },
);

const getEmailTriage = define(
  'get_email_triage',
  'As conversas já triadas: quem escreveu, o que quer, o que falta, o risco, a recomendação e o rascunho de resposta. `waiting_on` diz de quem é a vez — nunca assumas pela última mensagem.',
  z.object({
    waiting_on: z.enum(['carol', 'brand', 'nobody']).optional(),
    limit: z.number().optional(),
  }),
  async ({ waiting_on, limit }) => {
    const db = await supabaseServer();
    let q = db
      .from('thread_intel')
      .select('id, thread_id, brand_id, intent, waiting_on, waiting_since, who_wrote, what_they_want, what_is_missing, risk, risk_level, recommendation, draft_state, draft_subject, draft_body, prepared_at, brand:brand_id ( name )')
      .order('waiting_since', { ascending: true })
      .limit(cap(limit, 20));
    if (waiting_on) q = q.eq('waiting_on', waiting_on);

    const { data } = await q;
    const rows = data ?? [];
    return {
      data: rows.map((r) => {
        const brand = r.brand as { name: string } | { name: string }[] | null;
        return {
          threadId: r.thread_id,
          brand: (Array.isArray(brand) ? brand[0]?.name : brand?.name) ?? null,
          intent: r.intent,
          waitingOn: r.waiting_on,
          whoWrote: r.who_wrote,
          whatTheyWant: r.what_they_want,
          whatIsMissing: r.what_is_missing,
          risk: r.risk,
          riskLevel: r.risk_level,
          recommendation: r.recommendation,
          draftState: r.draft_state,
          draftSubject: r.draft_subject,
          draftBody: r.draft_body,
          preparedAt: r.prepared_at,
        };
      }),
      sources: rows.map((r) => ({
        id: r.thread_id, type: 'email' as const,
        label: r.who_wrote || 'Conversa', at: r.prepared_at, href: '/dashboard/inbox',
      })),
    };
  },
);

const prepareReply = define(
  'prepare_reply',
  'Prepara (ou refaz) a leitura e o rascunho de resposta de uma conversa. Normalmente já está feito de madrugada; usa isto quando ela pedir para reescrever ou quando a preparação falhou.',
  z.object({ thread_id: z.string().uuid() }),
  async ({ thread_id }) => {
    const { triageThread } = await import('@/modules/email/triage-service');
    const { getFlags } = await import('@/modules/settings/service');
    const outcome = await triageThread(thread_id, await getFlags(), { force: true });
    const { intelForThread } = await import('@/modules/email/triage-service');
    const intel = await intelForThread(thread_id);
    return {
      data: {
        status: outcome.status,
        detail: outcome.detail,
        // Nunca envia. Prepara e mostra; quem envia é ela, num botão.
        note: 'O rascunho fica preparado. O envio continua exigindo o sim dela.',
        draft: intel ? { subject: intel.draftSubject, body: intel.draftBody, state: intel.draftState } : null,
      },
      sources: [{ id: thread_id, type: 'email' as const, label: 'Conversa', at: null, href: '/dashboard/inbox' }],
    };
  },
  'write',
);

const getDailyContentPlan = define(
  'get_daily_content_plan',
  'O que ela tem para gravar hoje: uma ideia para Instagram e uma para TikTok, com gancho, guião, tomadas, edição e tempos. Usa isto para «o que gravo hoje?».',
  z.object({}),
  async () => {
    const { todayContent } = await import('@/modules/creator/plan-service');
    const ideas = await todayContent();
    return {
      data: ideas.length
        ? ideas.map((i) => ({
            id: i.id,
            platform: i.platform,
            pillar: i.pillarLabel,
            title: i.title,
            hook: i.hook,
            whyNow: i.whyNow,
            recordMinutes: i.recordMinutes,
            editMinutes: i.editMinutes,
            verdict: i.verdict,
            shots: i.shotList.length,
          }))
        : { note: 'Ainda não há plano para hoje. O trabalho corre às 07:00.' },
      sources: ideas.map((i) => ({
        id: i.id, type: 'portfolio' as const, label: i.title || i.hook, at: i.planDate,
        href: `/dashboard/content?idea=${i.id}`,
      })),
    };
  },
);

const getContentIdea = define(
  'get_content_idea',
  'Uma ideia de conteúdo por inteiro: guião, tomadas, b-roll, texto na tela, passos de CapCut, legenda e remate.',
  z.object({ idea_id: z.string().uuid() }),
  async ({ idea_id }) => {
    const { contentIdea } = await import('@/modules/creator/plan-service');
    const idea = await contentIdea(idea_id);
    if (!idea) return { data: { found: false }, sources: [] };
    return {
      data: { found: true, ...idea },
      sources: [{
        id: idea.id, type: 'portfolio' as const, label: idea.title || idea.hook, at: idea.planDate,
        href: `/dashboard/content?idea=${idea.id}`,
      }],
    };
  },
);

const regenerateContentIdea = define(
  'regenerate_content_idea',
  'Escreve outra ideia no lugar de uma, e diz porque é que a anterior não servia: off_profile (não tem nada a ver com ela), teaching (estava dando aula), too_hard (dava trabalho demais), seen_it (já está em todo lugar), wrong_moment (não é o momento). Usa isto para «quero outra», «isso não é a minha cara», «quero algo mais fácil».',
  z.object({
    idea_id: z.string().uuid(),
    direction: z.enum(['off_profile', 'teaching', 'too_hard', 'seen_it', 'wrong_moment']).optional(),
  }),
  async ({ idea_id, direction }) => {
    const { replaceIdea } = await import('@/modules/creator/replace-service');
    const r = await replaceIdea(idea_id, direction);
    if (!r.ok) return { data: { replaced: false, reason: r.error }, sources: [] };
    const { contentIdea } = await import('@/modules/creator/plan-service');
    const idea = await contentIdea(r.id);
    return {
      data: { replaced: true, idea },
      sources: idea
        ? [{ id: idea.id, type: 'portfolio' as const, label: idea.title || idea.hook, at: idea.planDate, href: `/dashboard/content?idea=${idea.id}` }]
        : [],
    };
  },
  'write',
);

const saveContentIdea = define(
  'save_content_idea',
  'Muda o estado de uma ideia: saved (salvar para depois), recorded (já gravou), published (já publicou), discarded (não é para ela).',
  z.object({
    idea_id: z.string().uuid(),
    status: z.enum(['ready', 'saved', 'recorded', 'published', 'discarded']),
  }),
  async ({ idea_id, status }) => {
    const { setIdeaStatus } = await import('@/modules/creator/plan-service');
    await setIdeaStatus(idea_id, status);
    return { data: { ok: true, status }, sources: [] };
  },
  'write',
);

const getBrandReferences = define(
  'get_brand_references',
  'As referências criativas separadas para uma marca da prospeção, com link, o que as faz funcionar, como adaptar e o que não copiar.',
  z.object({ candidate_id: z.string().uuid() }),
  async ({ candidate_id }) => {
    const { referencesForCandidates } = await import('@/app/dashboard/outreach-actions');
    const refs = await referencesForCandidates([candidate_id]);
    return {
      data: refs.length ? refs : { note: 'Esta marca ainda não tem referências separadas.' },
      sources: refs.map((r) => ({
        id: r.id, type: 'knowledge' as const, label: r.title || r.url, at: r.publishedAt, href: r.url,
      })),
    };
  },
);

const searchCreativeReferences = define(
  'search_creative_references',
  'Procura nas referências já salvas por plataforma, marca ou palavra. Não vai à web: para procurar uma referência nova para uma marca, usa adapt_reference_to_brand.',
  z.object({ query: z.string().optional(), platform: z.string().optional(), limit: z.number().optional() }),
  async ({ query, platform, limit }) => {
    const db = await supabaseServer();
    let q = db
      .from('creative_reference')
      .select('id, source_platform, source_url, title, creator_handle, brand_name, published_at, freshness, hook, structure, editing_style, why_it_works')
      .order('captured_at', { ascending: false })
      .limit(cap(limit, 20));
    if (platform) q = q.eq('source_platform', platform);
    if (query) q = q.or(`title.ilike.%${query}%,hook.ilike.%${query}%,brand_name.ilike.%${query}%`);

    const { data } = await q;
    const rows = data ?? [];
    return {
      data: rows,
      sources: rows.map((r) => ({
        id: r.id, type: 'knowledge' as const, label: r.title || r.source_url, at: r.published_at, href: r.source_url,
      })),
    };
  },
);

const adaptReferenceToBrand = define(
  'adapt_reference_to_brand',
  'Procura referências novas para uma marca candidata e transforma-as numa ideia gravável. Demora: é uma pesquisa na web mais duas chamadas.',
  z.object({ candidate_id: z.string().uuid() }),
  async ({ candidate_id }) => {
    const db = await supabaseServer();
    const { data: c } = await db
      .from('outreach_candidate')
      .select('id, name, product, niche_id, creative_opportunity, why_fit')
      .eq('id', candidate_id)
      .maybeSingle();
    if (!c) return { data: { found: false }, sources: [] };

    const { referencesForCandidate } = await import('@/modules/references/service');
    const r = await referencesForCandidate({
      candidateId: c.id,
      name: c.name,
      product: c.product ?? '',
      category: c.niche_id ?? '',
      angle: c.creative_opportunity || c.why_fit || '',
    });
    return {
      data: r.error ? { ok: false, reason: r.error } : { ok: true, references: r.saved, readyIdea: r.idea },
      sources: [{ id: c.id, type: 'brand' as const, label: c.name, at: null, href: '/dashboard/outreach' }],
    };
  },
  'write',
);

const getCreatorTrends = define(
  'get_creator_trends',
  'As tendências encontradas hoje que encaixam nela, com prova clicável e a razão do encaixe. As que não encaixam ficam de fora — mas foram vistas.',
  z.object({ limit: z.number().optional() }),
  async ({ limit }) => {
    const { usableTrends } = await import('@/modules/trends/service');
    const rows = await usableTrends(cap(limit, 12));
    return {
      data: rows.length ? rows : { note: 'Não há tendências atuais que encaixem nela. Isso é uma resposta, não uma falha.' },
      sources: rows.map((t) => ({
        id: t.id, type: 'knowledge' as const, label: t.title, at: t.detectedAt,
        href: t.evidence[0]?.url ?? t.sourceUrl ?? '/dashboard/content',
      })),
    };
  },
);

const getCreatorProfile = define(
  'get_creator_profile',
  'O retrato da Carol como criadora: como se filma, que duração prefere, que formatos evita. `coverage` diz quanto disto foi mesmo observado — com «unknown», não afirmes que uma coisa é o estilo dela.',
  z.object({}),
  async () => {
    const { readProfile } = await import('@/modules/creator/profile-service');
    const p = await readProfile();
    return {
      data: p ?? { coverage: 'unknown', note: 'Ainda não há retrato observado dela.' },
      sources: [],
    };
  },
);

const getBusinessMilestones = define(
  'get_business_milestones',
  'Os marcos reais da carreira dela, derivados de fatos gravados — nunca inventados. Serve para conteúdo de jornada.',
  z.object({ only_unused: z.boolean().optional(), limit: z.number().optional() }),
  async ({ only_unused, limit }) => {
    const { allMilestones, contentWorthyMilestones } = await import('@/modules/milestones/service');
    const rows = only_unused ? await contentWorthyMilestones(cap(limit, 10)) : await allMilestones(cap(limit, 30));
    return {
      data: rows.length ? rows : { note: 'Ainda não há marcos derivados. Sem fatos gravados, não se inventa nenhum.' },
      sources: rows.filter((m) => m.brandId).map((m) => ({
        id: m.brandId as string, type: 'brand' as const, label: m.brandName ?? 'Marca',
        at: m.occurredAt, href: `/dashboard/brands/${m.brandId}`,
      })),
    };
  },
);


const getContentMultiplier = define(
  'get_content_multiplier',
  'O que ela pode gravar PARA ELA aproveitando uma gravação de marca já marcada, sem acrescentar horas. Usa isto para «que conteúdo posso tirar do job de hoje?».',
  z.object({ collaboration_id: z.string().uuid() }),
  async ({ collaboration_id }) => {
    const { multiplierFor } = await import('@/modules/creator/multiplier-service');
    const r = await multiplierFor(collaboration_id);
    return {
      data: r.ok
        ? { brand: r.brandName, suggestions: r.suggestions }
        : { ok: false, reason: r.reason },
      sources: [{
        id: collaboration_id, type: 'portfolio' as const, label: 'Gravação', at: null,
        href: `/dashboard/production/${collaboration_id}`,
      }],
    };
  },
  'write',
);


const getContentStrategy = define(
  'get_content_strategy',
  'A estratégia de conteúdo dela: posicionamento, ADN, os cinco pilares com peso, o que parar, e as séries candidatas. Vem da auditoria do Instagram. Consulta isto ANTES de sugerir qualquer ideia — «me dá uma ideia» não se responde ao acaso.',
  z.object({}),
  async () => {
    const { STRATEGY, describeStrategy } = await import('@/modules/creator/strategy');
    const { seedsForPillar } = await import('@/modules/creator/seed-service');
    const db = await supabaseServer();

    // O que já saiu, para saber que pilar está em falta.
    const { data: recentes } = await db
      .from('creator_content_idea')
      .select('pillar, platform, hook, generated_at')
      .neq('status', 'seed')
      .order('generated_at', { ascending: false })
      .limit(12);

    const { pillarDebt, PILLAR_LABEL } = await import('@/modules/creator/domain');
    const debt = pillarDebt((recentes ?? []).map((r) => ({ pillar: r.pillar })));
    const emFalta = Object.entries(debt)
      .filter(([, v]) => v > 0.05)
      .sort((a, b) => b[1] - a[1])
      .map(([p]) => p);

    return {
      data: {
        version: STRATEGY.version,
        source: STRATEGY.source,
        summary: describeStrategy(),
        pillarsBehind: emFalta.map((p) => PILLAR_LABEL[p as keyof typeof PILLAR_LABEL] ?? p),
        seedsForTopPillar: emFalta[0] ? await seedsForPillar(emFalta[0], 4) : [],
        recent: (recentes ?? []).map((r) => ({ pillar: r.pillar, platform: r.platform, hook: r.hook })),
        note: 'Autoridade sim, professora não. Nunca proponhas dicas para creators nem tutorial.',
      },
      sources: [],
    };
  },
);

export const TOOLS: Tool[] = [
  searchBrands, getBrand, getBrandActivity,
  searchOpportunities, getOpportunity,
  getTodayActions, getFollowups,
  searchEmails, getEmailThread,
  calculatePrice, getPricingPolicy, getRevenueSummary,
  searchPortfolio, searchDocuments, getRights,
  searchBusinessMemory, searchKnowledge, createMemoryCandidate,
  getInstagramContext, getInsights,
  createFollowupDraft, createNote, snoozeFollowupTool,
  getDailyOutreach, getOutreachCandidate, updateOutreachDraftTool,
  approveOutreachTool, prepareOutreachSend,
  startProspecting, readProspectingFocus, setProspectingFocus,
  resolveTodayAction, captureSomething, findAnything,
  getMorningBrief, getEmailTriage, prepareReply,
  getDailyContentPlan, getContentIdea, regenerateContentIdea, saveContentIdea,
  getBrandReferences, searchCreativeReferences, adaptReferenceToBrand,
  getCreatorTrends, getCreatorProfile, getBusinessMilestones, getContentMultiplier,
  getContentStrategy,
];

export const byName = new Map(TOOLS.map((t) => [t.name, t]));
