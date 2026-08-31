import 'server-only';

import { aiTaskEnabled, type Flags } from '@/lib/flags';
import { formatMoney } from '@/lib/money';
import { asJson } from '@/lib/supabase/json';
import { supabaseServer } from '@/lib/supabase/server';
import { recordEvent } from '@/modules/activity/service';
import { runPrompt } from '@/modules/ai/gateway';
import { analyzeNegotiation, draftReply } from '@/modules/ai/prompts/registry';
import type { NegotiationAnalysis, ReplyDraft } from '@/modules/ai/schemas';
import { calculateQuote, type QuoteResult } from '@/modules/pricing/engine';
import { activePolicy } from '@/modules/pricing/service';
import { rightsRisks, BLANK_RIGHTS, type RightsScope } from '@/modules/rights/engine';

/** Copiloto comercial.
 *
 *  A ordem importa e é esta: primeiro o motor determinístico calcula o que é
 *  permitido dizer, depois o modelo escolhe como o dizer. Nunca ao contrário.
 *  Um modelo que decide preço é um modelo que baixa o preço para soar
 *  simpático — e o Handoff diz que é aí que a Carol deixa dinheiro na mesa. */

export type NegotiationContext = {
  opportunityId: string;
  brandName: string;
  stage: string;
  facts: Record<string, unknown>;
  rights: RightsScope;
  quote: QuoteResult | null;
  concessions: string[];
  history: string;
};

export async function buildContext(opportunityId: string): Promise<NegotiationContext | null> {
  const db = await supabaseServer();

  const { data: opp } = await db
    .from('opportunity')
    .select('id, stage, brand_id, product_name, commercial_model, expected_cash_cents, brand:brand_id ( name )')
    .eq('id', opportunityId)
    .maybeSingle();
  if (!opp) return null;

  const brand = opp.brand as unknown as { name: string } | null;

  const [{ data: events }, { data: threads }, { data: license }, { data: quotes }] = await Promise.all([
    db.from('activity_event').select('event_type, summary, payload, occurred_at')
      .eq('opportunity_id', opportunityId).order('occurred_at', { ascending: false }).limit(40),
    db.from('source_thread').select('id').eq('opportunity_id', opportunityId),
    db.from('rights_license').select('*').eq('opportunity_id', opportunityId).maybeSingle(),
    db.from('quote').select('*').eq('opportunity_id', opportunityId).order('version', { ascending: false }).limit(1),
  ]);

  // Os fatos comerciais vêm da última classificação, não de prosa.
  const classified = (events ?? []).find((e) => e.event_type === 'reply.classified');
  const facts = (classified?.payload ?? {}) as Record<string, unknown>;

  const concessions = (events ?? [])
    .filter((e) => e.event_type === 'concession.recorded')
    .map((e) => e.summary);

  let history = '';
  const threadIds = (threads ?? []).map((t) => t.id);
  if (threadIds.length) {
    const { data: messages } = await db
      .from('source_message')
      .select('direction, sent_at, body_text')
      .in('thread_id', threadIds)
      .order('sent_at', { ascending: true })
      .limit(20);
    history = (messages ?? [])
      .map((m) => `[${m.direction === 'inbound' ? 'marca' : 'carol'} ${m.sent_at.slice(0, 10)}] ${m.body_text.slice(0, 800)}`)
      .join('\n\n');
  }
  if (!history) {
    history = (events ?? [])
      .slice(0, 15)
      .reverse()
      .map((e) => `${e.occurred_at.slice(0, 10)} ${e.event_type}: ${e.summary}`)
      .join('\n');
  }

  const rights: RightsScope = license
    ? {
        organicAllowed: license.organic_allowed,
        paidAllowed: license.paid_allowed,
        platforms: license.platforms ?? [],
        territories: license.territories ?? [],
        startAt: license.start_at,
        endAt: license.end_at,
        durationDays: license.duration_days,
        whitelisting: license.whitelisting,
        exclusivity: license.exclusivity,
        exclusivityScope: license.exclusivity_scope,
        exclusivityEndAt: license.exclusivity_end_at,
        rawFootage: license.raw_footage,
        portfolioPermission: license.portfolio_permission,
        thirdPartyUsage: license.third_party_usage,
      }
    : {
        ...BLANK_RIGHTS,
        paidAllowed: Boolean(facts.paidUsageRequested),
        platforms: (facts.usagePlatforms as string[]) ?? [],
      };

  const policy = await activePolicy();
  const quote = quotes?.[0]
    ? null
    : calculateQuote(
        policy.rules,
        {
          videos: 1,
          paidUsage: Boolean(facts.paidUsageRequested),
          usageTerm: null,
          platforms: (facts.usagePlatforms as string[]) ?? [],
        },
        policy.version,
      );

  return {
    opportunityId,
    brandName: brand?.name ?? 'marca',
    stage: opp.stage,
    facts,
    rights,
    quote,
    concessions,
    history,
  };
}

function describeQuote(quote: QuoteResult | null): string {
  if (!quote) return 'Já existe um orçamento enviado nesta oportunidade. Não voltes a calcular preço.';
  const lines = quote.lines.map(
    (l) => `- ${l.label}: ${l.cents === null ? 'POR RESOLVER' : formatMoney(l.cents)} (${l.basis})`,
  );
  const unresolved = quote.unresolved.map((u) => `- ${u.label}: ${u.why}`);

  return [
    `Política: ${quote.policyVersion}`,
    quote.recommendedCents !== null
      ? `Valor calculado: ${formatMoney(quote.recommendedCents)}`
      : 'SEM VALOR CALCULÁVEL. Não pode indicar um número.',
    quote.minimumCents !== null ? `Piso: ${formatMoney(quote.minimumCents)}` : 'Piso não configurado.',
    lines.join('\n'),
    unresolved.length ? `Por resolver:\n${unresolved.join('\n')}` : '',
    quote.blockingQuestions.length ? `Perguntar antes de fechar valor:\n- ${quote.blockingQuestions.join('\n- ')}` : '',
    quote.humanOnly.length ? `Decisão exclusivamente humana:\n- ${quote.humanOnly.join('\n- ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export type CopilotResult =
  | { ok: true; analysis: NegotiationAnalysis; runId: string | null; recommendationId: string | null }
  | { ok: false; code: string; message: string };

export async function analyze(opportunityId: string, flags: Flags): Promise<CopilotResult> {
  if (!aiTaskEnabled(flags, 'ai_drafting')) {
    return { ok: false, code: 'flag_off', message: 'A bandeira ai_drafting está fechada.' };
  }

  const ctx = await buildContext(opportunityId);
  if (!ctx) return { ok: false, code: 'not_found', message: 'Oportunidade não encontrada.' };

  const risks = rightsRisks(ctx.rights);
  const policy = await activePolicy();

  const result = await runPrompt(
    analyzeNegotiation,
    {
      brandName: ctx.brandName,
      stage: ctx.stage,
      facts: JSON.stringify(ctx.facts, null, 2),
      pricing: describeQuote(ctx.quote),
      rights: risks.length
        ? risks.map((r) => `- [${r.severity}] ${r.message}${r.question ? ` Perguntar: ${r.question}` : ''}`).join('\n')
        : 'Sem riscos de direitos detectados.',
      concessions: ctx.concessions.join('\n'),
      history: ctx.history,
    },
    {
      entityType: 'opportunity',
      entityId: opportunityId,
      policyVersions: { pricing: policy.version },
    },
  );

  if (!result.ok) return { ok: false, code: result.code, message: result.message };

  const db = await supabaseServer();
  const { data: opp } = await db.from('opportunity').select('brand_id').eq('id', opportunityId).maybeSingle();

  const { data: rec } = await db
    .from('ai_recommendation')
    .insert({
      ai_run_id: result.runId,
      opportunity_id: opportunityId,
      brand_id: opp?.brand_id ?? null,
      kind: 'negotiation',
      action: result.output.recommendation,
      summary: result.output.summary,
      reason: result.output.reasoning,
      payload: asJson(result.output),
      risk: result.output.risks.some((r) => r.severity === 'high')
        ? 'high'
        : result.output.risks.length
          ? 'medium'
          : 'none',
      confidence: result.output.confidence,
      requires_approval: true,
    })
    .select('id')
    .maybeSingle();

  return { ok: true, analysis: result.output, runId: result.runId, recommendationId: rec?.id ?? null };
}

export type DraftResult =
  | { ok: true; draft: ReplyDraft; runId: string | null }
  | { ok: false; code: string; message: string };

/** Escreve o rascunho. O que o modelo pode dizer sobre dinheiro vem calculado
 *  e vai explícito no prompt; o que não pode prometer vai numa lista de
 *  proibições, também explícita. */
export async function draft(
  opportunityId: string,
  goal: string,
  flags: Flags,
): Promise<DraftResult> {
  if (!aiTaskEnabled(flags, 'ai_drafting')) {
    return { ok: false, code: 'flag_off', message: 'A bandeira ai_drafting está fechada.' };
  }

  const ctx = await buildContext(opportunityId);
  if (!ctx) return { ok: false, code: 'not_found', message: 'Oportunidade não encontrada.' };

  const db = await supabaseServer();
  const { data: contact } = await db
    .from('contact')
    .select('name, language')
    .eq('brand_id', (await db.from('opportunity').select('brand_id').eq('id', opportunityId).maybeSingle()).data?.brand_id ?? '')
    .limit(1)
    .maybeSingle();

  const forbidden = [
    'Qualquer valor que não esteja na lista de valores permitidos.',
    'Descontos, mesmo pequenos.',
    'Uso perpétuo, buyout, exclusividade, whitelisting ou arquivos em bruto.',
    'Revisões ilimitadas.',
    'Promessas de vendas, ROAS ou resultado de campanha.',
    'Aceitar permuta sem passar pela decisão da Carol.',
    ...(ctx.quote?.humanOnly ?? []),
  ];

  const result = await runPrompt(
    draftReply,
    {
      brandName: ctx.brandName,
      contactName: contact?.name || null,
      language: contact?.language || 'português do Brasil',
      goal,
      facts: JSON.stringify(ctx.facts, null, 2),
      allowed: describeQuote(ctx.quote),
      forbidden: forbidden.map((f) => `- ${f}`).join('\n'),
      threadExcerpt: ctx.history,
    },
    { entityType: 'opportunity', entityId: opportunityId },
  );

  if (!result.ok) return { ok: false, code: result.code, message: result.message };
  return { ok: true, draft: result.output, runId: result.runId };
}

/** Toda a concessão vira evento. Sem isto, a ronda seguinte não sabe o que já
 *  foi cedido e a negociação escorrega sozinha. */
export async function recordConcession(
  opportunityId: string,
  what: string,
  inExchangeFor: string,
  actorUserId: string,
) {
  const db = await supabaseServer();
  const { data: opp } = await db.from('opportunity').select('brand_id').eq('id', opportunityId).maybeSingle();

  await recordEvent(db, {
    eventType: 'concession.recorded',
    brandId: opp?.brand_id ?? null,
    opportunityId,
    actorType: 'carol',
    actorUserId,
    summary: inExchangeFor ? `Cedido: ${what}. Em troca de: ${inExchangeFor}.` : `Cedido: ${what}.`,
    payload: { what, inExchangeFor },
  });
}

export async function decideRecommendation(
  recommendationId: string,
  decision: 'accepted' | 'edited' | 'rejected',
) {
  const db = await supabaseServer();
  const { data } = await db
    .from('ai_recommendation')
    .update({ status: decision, decided_at: new Date().toISOString() })
    .eq('id', recommendationId)
    .select('ai_run_id')
    .maybeSingle();

  // O veredicto humano volta para a corrida de IA: é assim que se mede a
  // qualidade do prompt com casos reais em vez de por sensação.
  if (data?.ai_run_id) {
    await db
      .from('ai_run')
      .update({ human_decision: decision, decided_at: new Date().toISOString() })
      .eq('id', data.ai_run_id);
  }
}
