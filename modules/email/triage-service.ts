import 'server-only';

import { aiTaskEnabled, type Flags } from '@/lib/flags';
import { hashContent } from '@/lib/crypto';
import { formatMoney } from '@/lib/money';
import { asJson } from '@/lib/supabase/json';
import { supabaseService } from '@/lib/supabase/service';
import { runPrompt } from '@/modules/ai/gateway';
import { readThread } from '@/modules/ai/prompts/registry';
import { decodeEntities } from '@/lib/html';
import { calculateQuote } from '@/modules/pricing/engine';
import { activePolicy } from '@/modules/pricing/service';
import { BLANK_RIGHTS, rightsRisks, type RightsScope } from '@/modules/rights/engine';
import { languageOfThread, observeEdit } from './voice';
import {
  INTENT_LABEL,
  THREAD_INTENTS,
  URGENT_INTENTS,
  guessIntent,
  isThreadIntent,
  readThreadState,
  waitingLine,
  type ThreadIntent,
  type ThreadMessage,
} from './thread-state';

/** A triagem de email, feita antes de ela chegar.
 *
 *  A Deep Review contou nove passos entre «a marca respondeu» e «a Carol
 *  enviou»: abrir, descobrir que não dá para ler, navegar, rolar até ao
 *  copiloto, esperar 30 s, escolher um objetivo num dropdown, esperar mais
 *  25 s, corrigir o português, e sair da aplicação. Sete desses nove passos
 *  existiam porque o trabalho começava quando ela clicava.
 *
 *  Aqui começa às seis da manhã. Uma chamada por conversa, não duas — a
 *  análise e o rascunho eram o mesmo raciocínio partido ao meio, e o segundo
 *  metade das vezes contradizia o primeiro.
 *
 *  Idempotente pelo estado da conversa: enquanto não chegar mensagem nova, uma
 *  segunda passagem não gasta nada. */

export type TriageOutcome = {
  threadId: string;
  status: 'prepared' | 'unchanged' | 'no_reply_needed' | 'deterministic' | 'failed';
  intent: ThreadIntent;
  detail: string;
};

export type TriageReport = {
  processed: number;
  prepared: number;
  unchanged: number;
  failed: number;
  drafts: number;
  gaps: string[];
};

/** Nunca se prepara resposta para uma conversa que não é comercial, nem para
 *  uma em que a bola já está do lado da marca. */
const TRIAGE_LIMIT = 40;

export async function triageThreads(flags: Flags, limit = TRIAGE_LIMIT): Promise<TriageReport> {
  const db = supabaseService();
  const gaps: string[] = [];

  const { data: threads, error } = await db
    .from('source_thread')
    .select('id, subject, brand_id, opportunity_id, classification, last_message_at')
    .eq('classification', 'commercial')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    return { processed: 0, prepared: 0, unchanged: 0, failed: 0, drafts: 0, gaps: ['Não consegui ler as conversas.'] };
  }

  const rows = threads ?? [];
  if (rows.length === 0) return { processed: 0, prepared: 0, unchanged: 0, failed: 0, drafts: 0, gaps: [] };

  // A voz dela é a mesma para todas as conversas: lê-se uma vez, não quarenta.
  const voice = await voiceExamples();

  let prepared = 0;
  let unchanged = 0;
  let failed = 0;
  let drafts = 0;

  for (const t of rows) {
    const outcome = await triageThread(t.id, flags, { voice });
    if (outcome.status === 'unchanged') unchanged++;
    else if (outcome.status === 'failed') {
      failed++;
      if (gaps.length < 3) gaps.push(outcome.detail);
    } else {
      prepared++;
      if (outcome.status === 'prepared') drafts++;
    }
  }

  return { processed: rows.length, prepared, unchanged, failed, drafts, gaps };
}

type VoiceExamples = { text: string; language: string };

/** Como ela escreve, a partir do que ela escreveu mesmo.
 *
 *  Duas fontes: as mensagens que já saíram, e as correções que ela fez a
 *  rascunhos anteriores. A segunda é a que resolve o português do Brasil sem
 *  ninguém configurar nada. */
async function voiceExamples(): Promise<VoiceExamples> {
  const db = supabaseService();

  const [{ data: sent }, { data: edits }] = await Promise.all([
    db
      .from('source_message')
      .select('body_text, sent_at')
      .eq('direction', 'outbound')
      .order('sent_at', { ascending: false })
      .limit(8),
    db
      .from('voice_memory')
      .select('ai_text, final_text, observations')
      .eq('kind', 'reply')
      .order('created_at', { ascending: false })
      .limit(6),
  ]);

  const exemplos = (sent ?? [])
    .map((m) => decodeEntities(m.body_text ?? '').slice(0, 700))
    .filter((b) => b.trim().length > 40);

  const correcoes = (edits ?? [])
    .filter((e) => e.final_text && e.ai_text && e.final_text !== e.ai_text)
    .map((e) => {
      const notas = (e.observations as string[] | null) ?? [];
      return notas.length
        ? `Correção dela: ${notas.join('; ')}`
        : `Escreveu-se «${e.ai_text.slice(0, 160)}»; ela mudou para «${e.final_text.slice(0, 160)}».`;
    });

  return {
    text: [
      exemplos.length ? `Mensagens reais dela:\n"""\n${exemplos.join('\n---\n')}\n"""` : '',
      correcoes.length ? `O que ela costuma corrigir nos rascunhos:\n- ${correcoes.join('\n- ')}` : '',
    ]
      .filter(Boolean)
      .join('\n\n'),
    language: 'pt-BR',
  };
}

export async function triageThread(
  threadId: string,
  flags: Flags,
  opts: { voice?: VoiceExamples; force?: boolean } = {},
): Promise<TriageOutcome> {
  const db = supabaseService();

  const { data: thread } = await db
    .from('source_thread')
    .select('id, subject, participants, brand_id, opportunity_id, classification')
    .eq('id', threadId)
    .maybeSingle();

  if (!thread) return { threadId, status: 'failed', intent: 'UNCERTAIN', detail: 'Conversa não encontrada.' };

  const { data: rows } = await db
    .from('source_message')
    .select('id, direction, sent_at, from_address, from_name, subject, body_text')
    .eq('thread_id', threadId)
    .order('sent_at', { ascending: true })
    .limit(40);

  const messages: ThreadMessage[] = (rows ?? []).map((m) => ({
    id: m.id,
    direction: m.direction as 'inbound' | 'outbound',
    sentAt: m.sent_at,
    fromAddress: m.from_address,
    fromName: m.from_name,
    subject: m.subject,
    bodyText: decodeEntities(m.body_text ?? ''),
  }));

  const state = readThreadState(messages);

  // A impressão digital é o estado do mundo de que esta preparação saiu.
  // Enquanto não chegar mensagem nova, correr outra vez não gasta um cêntimo.
  const fingerprint = await hashContent(
    `${state.last?.id ?? 'vazio'}:${messages.length}:${flags.ai_drafting ? 'ai' : 'det'}`,
  );

  const { data: existing } = await db
    .from('thread_intel')
    .select('id, source_fingerprint, draft_state')
    .eq('thread_id', threadId)
    .maybeSingle();

  if (!opts.force && existing?.source_fingerprint === fingerprint) {
    return { threadId, status: 'unchanged', intent: 'UNCERTAIN', detail: 'Nada mudou nesta conversa.' };
  }

  const brandName = await brandNameFor(db, thread.brand_id);
  const palpite = guessIntent(state);

  const base = {
    thread_id: threadId,
    opportunity_id: thread.opportunity_id,
    brand_id: thread.brand_id,
    last_external_message_id: state.lastExternal?.id ?? null,
    last_carol_message_id: state.lastCarol?.id ?? null,
    waiting_on: state.waitingOn,
    waiting_since: state.waitingSince,
    source_fingerprint: fingerprint,
    prepared_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const save = async (patch: Record<string, unknown>) => {
    await db.from('thread_intel').upsert({ ...base, ...patch }, { onConflict: 'thread_id' });
  };

  // ── Sem nada da marca, não há nada para classificar ─────────────────────
  if (!state.lastExternal) {
    await save({
      intent: 'UNCERTAIN',
      intent_confidence: 0,
      secondary_intents: asJson([]),
      who_wrote: '',
      what_they_want: '',
      what_changed: '',
      what_is_missing: '',
      risk: '',
      risk_level: 'none',
      recommendation: waitingLine(state, brandName),
      draft_state: 'skipped',
      draft_reason: 'A marca ainda não respondeu a esta conversa.',
      draft_subject: '',
      draft_body: '',
      failure: null,
    });
    return { threadId, status: 'no_reply_needed', intent: 'UNCERTAIN', detail: 'Sem mensagem da marca.' };
  }

  // ── Sem IA: o chão determinístico, dito como tal ────────────────────────
  if (!aiTaskEnabled(flags, 'ai_drafting')) {
    await save({
      intent: palpite.intent,
      intent_confidence: palpite.confidence,
      secondary_intents: asJson([]),
      who_wrote: state.lastExternal.fromName || state.lastExternal.fromAddress || brandName,
      what_they_want: `Pelo que está escrito, ${INTENT_LABEL[palpite.intent]}.`,
      what_changed: '',
      what_is_missing: '',
      risk: '',
      risk_level: URGENT_INTENTS.has(palpite.intent) ? 'medium' : 'none',
      recommendation: waitingLine(state, brandName),
      draft_state: 'skipped',
      draft_reason: 'A camada de IA está fechada, por isso não há rascunho escrito.',
      draft_subject: '',
      draft_body: '',
      failure: null,
    });
    return { threadId, status: 'deterministic', intent: palpite.intent, detail: 'Preparada sem IA.' };
  }

  // ── Com IA: uma chamada, tudo de uma vez ────────────────────────────────
  const facts = await latestFacts(db, thread.opportunity_id);

  const scope: RightsScope = {
    ...BLANK_RIGHTS,
    paidAllowed: Boolean(facts.paidUsageRequested),
    platforms: (facts.usagePlatforms as string[]) ?? [],
  };
  const risks = rightsRisks(scope);

  const policy = await activePolicy();
  const calculo = calculateQuote(
    policy.rules,
    {
      videos: 1,
      paidUsage: Boolean(facts.paidUsageRequested),
      usageTerm: null,
      platforms: (facts.usagePlatforms as string[]) ?? [],
    },
    policy.version,
  );

  const permitido = [
    calculo.recommendedCents !== null
      ? `Valor calculado pela política ${calculo.policyVersion}: ${formatMoney(calculo.recommendedCents)}.`
      : 'SEM VALOR CALCULÁVEL. Não pode indicar um número: tem de perguntar o que falta.',
    calculo.minimumCents !== null ? `Piso: ${formatMoney(calculo.minimumCents)}.` : '',
    calculo.blockingQuestions.length
      ? `Perguntar antes de fechar valor:\n- ${calculo.blockingQuestions.join('\n- ')}`
      : '',
    calculo.humanOnly.length ? `Decisão só dela:\n- ${calculo.humanOnly.join('\n- ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const idioma = languageOfThread({
    participants: (thread.participants as string[] | null) ?? [],
    externalText: state.lastExternal.bodyText ?? '',
    carolText: state.lastCarol?.bodyText ?? '',
  });

  const historia = messages
    .slice(-12)
    .map((m) => `[${m.direction === 'inbound' ? 'marca' : 'carol'} ${m.sentAt.slice(0, 10)}] ${(m.bodyText ?? '').slice(0, 900)}`)
    .join('\n\n');

  const voice = opts.voice ?? (await voiceExamples());

  const result = await runPrompt(
    readThread,
    {
      brandName,
      stage: await stageFor(db, thread.opportunity_id),
      latestExternal: (state.lastExternal.bodyText ?? '').slice(0, 6000),
      latestExternalAt: state.lastExternal.sentAt.slice(0, 10),
      waiting: waitingLine(state, brandName),
      history: historia,
      facts: JSON.stringify(facts, null, 2),
      pricing: permitido,
      rights: risks.length
        ? risks.map((r) => `- [${r.severity}] ${r.message}${r.question ? ` Perguntar: ${r.question}` : ''}`).join('\n')
        : 'Sem riscos de direitos detectados.',
      voice: voice.text || '(sem exemplos salvos)',
      language: idioma,
      today: new Date().toISOString().slice(0, 10),
      intents: THREAD_INTENTS.join(', '),
    },
    {
      entityType: 'source_thread',
      entityId: threadId,
      policyVersions: { pricing: policy.version },
      timeoutMs: 60_000,
    },
  );

  if (!result.ok) {
    // Uma falha de modelo não apaga o que se sabe sem ele.
    await save({
      intent: palpite.intent,
      intent_confidence: palpite.confidence,
      secondary_intents: asJson([]),
      who_wrote: state.lastExternal.fromName || brandName,
      what_they_want: `Pelo que está escrito, ${INTENT_LABEL[palpite.intent]}.`,
      what_changed: '',
      what_is_missing: '',
      risk: '',
      risk_level: URGENT_INTENTS.has(palpite.intent) ? 'medium' : 'none',
      recommendation: waitingLine(state, brandName),
      draft_state: 'failed',
      draft_reason: 'Não consegui escrever a resposta esta manhã.',
      draft_subject: '',
      draft_body: '',
      failure: result.message.slice(0, 300),
    });
    return { threadId, status: 'failed', intent: palpite.intent, detail: `${brandName}: ${result.message}` };
  }

  const out = result.output;
  const intent: ThreadIntent = isThreadIntent(out.intent) ? out.intent : palpite.intent;
  const assunto =
    out.reply_subject?.trim() ||
    (thread.subject?.toLowerCase().startsWith('re:') ? thread.subject : `Re: ${thread.subject || '(sem assunto)'}`);

  await save({
    intent,
    intent_confidence: out.confidence,
    secondary_intents: asJson(out.secondary_intents.filter(isThreadIntent)),
    who_wrote: out.who_wrote,
    what_they_want: out.what_they_want,
    what_changed: out.what_changed,
    what_is_missing: out.what_is_missing.join('; '),
    risk: out.risk,
    risk_level: out.risk_level,
    recommendation: out.recommendation,
    draft_subject: out.needs_reply ? assunto : '',
    draft_body: out.needs_reply ? out.reply_body : '',
    draft_language: out.reply_language,
    draft_state: out.needs_reply ? 'ready' : 'skipped',
    draft_reason: out.needs_reply ? '' : 'Não há nada a responder agora.',
    draft_run_id: result.runId,
    failure: null,
  });

  return {
    threadId,
    status: out.needs_reply ? 'prepared' : 'no_reply_needed',
    intent,
    detail: out.recommendation,
  };
}

async function brandNameFor(db: ReturnType<typeof supabaseService>, brandId: string | null): Promise<string> {
  if (!brandId) return 'a marca';
  const { data } = await db.from('brand').select('name').eq('id', brandId).maybeSingle();
  return data?.name ?? 'a marca';
}

async function stageFor(db: ReturnType<typeof supabaseService>, opportunityId: string | null): Promise<string> {
  if (!opportunityId) return 'sem oportunidade aberta';
  const { data } = await db.from('opportunity').select('stage').eq('id', opportunityId).maybeSingle();
  return data?.stage ?? 'desconhecida';
}

async function latestFacts(
  db: ReturnType<typeof supabaseService>,
  opportunityId: string | null,
): Promise<Record<string, unknown>> {
  if (!opportunityId) return {};
  const { data } = await db
    .from('activity_event')
    .select('payload')
    .eq('opportunity_id', opportunityId)
    .eq('event_type', 'reply.classified')
    .order('occurred_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.payload ?? {}) as Record<string, unknown>;
}

/* ── Leituras para a interface ────────────────────────────────────────────── */

export type ThreadIntelRow = {
  id: string;
  threadId: string;
  brandId: string | null;
  brandName: string;
  opportunityId: string | null;
  subject: string;
  intent: ThreadIntent;
  intentLabel: string;
  urgent: boolean;
  waitingOn: 'carol' | 'brand' | 'nobody';
  waitingDays: number | null;
  whoWrote: string;
  whatTheyWant: string;
  whatChanged: string;
  whatIsMissing: string;
  risk: string;
  riskLevel: 'none' | 'low' | 'medium' | 'high';
  recommendation: string;
  draftSubject: string;
  draftBody: string;
  draftState: 'none' | 'ready' | 'stale' | 'failed' | 'sent' | 'skipped';
  draftReason: string;
  replyTo: string | null;
  preparedAt: string | null;
};

const SELECT_INTEL = `
  id, thread_id, brand_id, opportunity_id, intent, intent_confidence, waiting_on, waiting_since,
  who_wrote, what_they_want, what_changed, what_is_missing, risk, risk_level, recommendation,
  draft_subject, draft_body, draft_state, draft_reason, prepared_at,
  thread:thread_id ( subject ),
  brand:brand_id ( name )
`;

type RawIntel = {
  id: string;
  thread_id: string;
  brand_id: string | null;
  opportunity_id: string | null;
  intent: string;
  waiting_on: string;
  waiting_since: string | null;
  who_wrote: string;
  what_they_want: string;
  what_changed: string;
  what_is_missing: string;
  risk: string;
  risk_level: string;
  recommendation: string;
  draft_subject: string;
  draft_body: string;
  draft_state: string;
  draft_reason: string;
  prepared_at: string | null;
  thread: { subject: string } | { subject: string }[] | null;
  brand: { name: string } | { name: string }[] | null;
};

const one = <T>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

function toRow(r: RawIntel, replyTo: string | null): ThreadIntelRow {
  const intent: ThreadIntent = isThreadIntent(r.intent) ? r.intent : 'UNCERTAIN';
  const since = r.waiting_since ? Date.parse(r.waiting_since) : null;
  return {
    id: r.id,
    threadId: r.thread_id,
    brandId: r.brand_id,
    brandName: one(r.brand)?.name ?? 'Marca por identificar',
    opportunityId: r.opportunity_id,
    subject: one(r.thread)?.subject ?? '(sem assunto)',
    intent,
    intentLabel: INTENT_LABEL[intent],
    urgent: URGENT_INTENTS.has(intent),
    waitingOn: (r.waiting_on as ThreadIntelRow['waitingOn']) ?? 'nobody',
    waitingDays: since === null ? null : Math.max(0, Math.floor((Date.now() - since) / 86_400_000)),
    whoWrote: r.who_wrote,
    whatTheyWant: r.what_they_want,
    whatChanged: r.what_changed,
    whatIsMissing: r.what_is_missing,
    risk: r.risk,
    riskLevel: (r.risk_level as ThreadIntelRow['riskLevel']) ?? 'none',
    recommendation: r.recommendation,
    draftSubject: r.draft_subject,
    draftBody: r.draft_body,
    draftState: (r.draft_state as ThreadIntelRow['draftState']) ?? 'none',
    draftReason: r.draft_reason,
    replyTo,
    preparedAt: r.prepared_at,
  };
}

/** As conversas em que a bola é dela e já há resposta escrita.
 *
 *  É isto que enche o «3 respostas precisam do teu sim» do Morning Brief. */
export async function repliesWaiting(limit = 8): Promise<ThreadIntelRow[]> {
  const db = supabaseService();
  const { data } = await db
    .from('thread_intel')
    .select(SELECT_INTEL)
    .eq('waiting_on', 'carol')
    .in('draft_state', ['ready', 'stale'])
    .order('waiting_since', { ascending: true })
    .limit(limit);

  const rows = (data ?? []) as unknown as RawIntel[];
  const replyTo = await replyAddresses(rows.map((r) => r.thread_id));
  return rows.map((r) => toRow(r, replyTo.get(r.thread_id) ?? null));
}

export async function intelForThread(threadId: string): Promise<ThreadIntelRow | null> {
  const db = supabaseService();
  const { data } = await db.from('thread_intel').select(SELECT_INTEL).eq('thread_id', threadId).maybeSingle();
  if (!data) return null;
  const raw = data as unknown as RawIntel;
  const replyTo = await replyAddresses([threadId]);
  return toRow(raw, replyTo.get(threadId) ?? null);
}

export async function intelForThreads(threadIds: readonly string[]): Promise<Map<string, ThreadIntelRow>> {
  if (threadIds.length === 0) return new Map();
  const db = supabaseService();
  const { data } = await db.from('thread_intel').select(SELECT_INTEL).in('thread_id', threadIds as string[]);
  const rows = (data ?? []) as unknown as RawIntel[];
  const replyTo = await replyAddresses(rows.map((r) => r.thread_id));
  return new Map(rows.map((r) => [r.thread_id, toRow(r, replyTo.get(r.thread_id) ?? null)]));
}

/** Para quem vai a resposta: o último remetente de fora, por conversa. */
async function replyAddresses(threadIds: readonly string[]): Promise<Map<string, string>> {
  if (threadIds.length === 0) return new Map();
  const db = supabaseService();
  const { data } = await db
    .from('source_message')
    .select('thread_id, from_address, sent_at')
    .in('thread_id', threadIds as string[])
    .eq('direction', 'inbound')
    .order('sent_at', { ascending: false });

  const out = new Map<string, string>();
  for (const m of data ?? []) {
    if (!out.has(m.thread_id) && m.from_address) out.set(m.thread_id, m.from_address);
  }
  return out;
}

/** O que ela mudou no rascunho vira memória.
 *
 *  Só estilo. Nunca política comercial: um modelo que aprende a baixar o preço
 *  porque ela o baixou uma vez é um modelo a decidir dinheiro. */
export async function rememberEdit(input: {
  threadId: string;
  brandId: string | null;
  aiText: string;
  finalText: string;
}): Promise<void> {
  if (!input.aiText || input.aiText === input.finalText) return;
  const db = supabaseService();
  await db.from('voice_memory').insert({
    kind: 'reply',
    language: 'pt-BR',
    ai_text: input.aiText.slice(0, 8000),
    final_text: input.finalText.slice(0, 8000),
    brand_id: input.brandId,
    thread_id: input.threadId,
    observations: asJson(observeEdit(input.aiText, input.finalText)),
  });
}

export { languageOfThread, observeEdit } from './voice';
