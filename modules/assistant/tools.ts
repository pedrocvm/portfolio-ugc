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

export type Tool = {
  name: string;
  description: string;
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
): Tool {
  return { name, description, input, run: run as Tool['run'] };
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
  'Escreve o texto de um follow-up já agendado. Guarda como rascunho — não envia nada.',
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


/* ── Prospecção diária ───────────────────────────────────────────────────── */

const getDailyOutreach = define(
  'get_daily_outreach_batch',
  'As marcas que a prospecção encontrou hoje, com encaixe, porquê, contato e o email preparado.',
  z.object({ niche: z.string().optional(), limit: z.number().optional() }),
  async ({ niche, limit }) => {
    const db = await supabaseServer();
    const { data: run } = await db
      .from('outreach_run')
      .select('id, run_date, status, selected')
      .order('run_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!run) return { data: { found: false, note: 'Ainda não correu nenhuma prospecção.' }, sources: [] };

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
  'Reescreve o assunto ou o corpo de uma abordagem. Guarda; não envia.',
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
    return { data: { saved: true, sent: false, note: 'Salvo. O envio continua a passar por ela.' }, sources: [] };
  },
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
);

const prepareOutreachSend = define(
  'prepare_outreach_send',
  'Verifica se uma abordagem está pronta a sair e devolve exactamente o que sairia. NÃO envia — o envio é sempre uma ação da Carol na interface.',
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
        note: 'Nada foi enviado. Para enviar, ela clica em Enviar na tela de Prospecção.',
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
];

export const byName = new Map(TOOLS.map((t) => [t.name, t]));
