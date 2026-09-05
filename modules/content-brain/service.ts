/** Acesso a dados do Content Brain.
 *
 *  Aqui os invariants do domínio encontram a base. Toda a escrita passa por
 *  `canStructure`, `canTransition` ou `contentGate` antes de tocar numa
 *  tabela — e é por isso que a mesma proteção vale para a UI, para a server
 *  action e para a ferramenta do assistente: os três chegam por aqui.
 *
 *  Um componente de cliente nunca importa este ficheiro.
 *
 *  Server-only. */

import 'server-only';

import { asJson } from '@/lib/supabase/json';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseService } from '@/lib/supabase/service';
import { runPrompt } from '@/modules/ai/gateway';
import { ideaFingerprint } from '@/modules/creator/domain';
import {
  canGenerateScript,
  canStructure,
  canTransition,
  contentGate,
  defaultPrivacy,
  eligibleForSuggestion,
  excludedTopicIn,
  factStatusAfterEdit,
  factsEditReopens,
  isFunctionalPillar,
  pillarCoverage,
  quoteIsGrounded,
  unsupportedBeats,
  validFrames,
  type FunctionalPillar,
  type PillarCoverage,
  type PrivacyLevel,
  type StoryFactState,
  type StorySourceType,
  type StoryStatus,
} from './domain';
import {
  confirmStoryFacts as confirmPrompt,
  extractStoryFacts as extractPrompt,
  mapStoryToPillars as mapPrompt,
  proposeFraming as framingPrompt,
  structureStory as structurePrompt,
  writeVoiceScript as scriptPrompt,
} from './prompts';
import { SOT_VERSION } from './taste';

export type Fact = { text: string; confirmed: boolean };

export type StoryRow = {
  id: string;
  title: string;
  summary: string;
  sourceType: StorySourceType;
  occurredAt: string | null;
  capturedAt: string;
  facts: Fact[];
  uncertainPoints: string[];
  carolMeaning: string | null;
  carolQuotes: string[];
  pillar: FunctionalPillar | null;
  territories: string[];
  privacyLevel: PrivacyLevel;
  allowedForContent: boolean;
  factStatus: StoryFactState['factStatus'];
  factConfirmedAt: string | null;
  status: StoryStatus;
  frameId: string | null;
  frameLabel: string | null;
  frameOptions: { id: string; label: string; because: string; factIndexes: number[] }[];
  structure: Record<string, unknown> | null;
  seriesId: string | null;
  transcript: string | null;
  audioPath: string | null;
  contentIdeaIds: string[];
};

const SELECT =
  'id, title, summary, source_type, occurred_at, captured_at, factual_sequence, uncertain_points, carol_meaning, carol_quotes, functional_pillar, territories, privacy_level, allowed_for_content, fact_status, fact_confirmed_at, status, frame_id, frame_label, frame_options, structure, series_id, transcript, audio_path';

type RawStory = Record<string, unknown>;

const asArray = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

function toStory(r: RawStory, links: string[] = []): StoryRow {
  const facts = asArray<unknown>(r.factual_sequence).map((f) =>
    typeof f === 'string' ? { text: f, confirmed: false } : (f as Fact),
  );
  return {
    id: String(r.id),
    title: String(r.title ?? ''),
    summary: String(r.summary ?? ''),
    sourceType: r.source_type as StorySourceType,
    occurredAt: (r.occurred_at as string | null) ?? null,
    capturedAt: String(r.captured_at),
    facts,
    uncertainPoints: asArray<string>(r.uncertain_points),
    carolMeaning: (r.carol_meaning as string | null) ?? null,
    carolQuotes: asArray<string>(r.carol_quotes),
    pillar: isFunctionalPillar(r.functional_pillar) ? r.functional_pillar : null,
    territories: asArray<string>(r.territories),
    privacyLevel: r.privacy_level as PrivacyLevel,
    allowedForContent: Boolean(r.allowed_for_content),
    factStatus: r.fact_status as StoryFactState['factStatus'],
    factConfirmedAt: (r.fact_confirmed_at as string | null) ?? null,
    status: r.status as StoryStatus,
    frameId: (r.frame_id as string | null) ?? null,
    frameLabel: (r.frame_label as string | null) ?? null,
    frameOptions: asArray<{ id: string; label: string; because: string; factIndexes: number[] }>(r.frame_options),
    structure: (r.structure as Record<string, unknown> | null) ?? null,
    seriesId: (r.series_id as string | null) ?? null,
    transcript: (r.transcript as string | null) ?? null,
    audioPath: (r.audio_path as string | null) ?? null,
    contentIdeaIds: links,
  };
}

const factState = (s: StoryRow): StoryFactState => ({
  status: s.status,
  factStatus: s.factStatus,
  factConfirmedAt: s.factConfirmedAt,
  privacyLevel: s.privacyLevel,
  allowedForContent: s.allowedForContent,
  pillar: s.pillar,
  frameId: s.frameId,
});

export type Result<T = void> = { ok: true; data: T } | { ok: false; error: string };
const fail = (error: string): Result<never> => ({ ok: false, error });

/* ── Leitura ──────────────────────────────────────────────────────────────── */

export async function listStories(opts: { status?: StoryStatus[]; limit?: number } = {}): Promise<StoryRow[]> {
  const db = await supabaseServer();
  let q = db.from('creator_story').select(SELECT).order('captured_at', { ascending: false }).limit(opts.limit ?? 60);
  if (opts.status?.length) q = q.in('status', opts.status);
  const { data } = await q;
  return (data ?? []).map((r) => toStory(r as RawStory));
}

export async function getStory(id: string): Promise<StoryRow | null> {
  const db = await supabaseServer();
  const [{ data }, { data: links }] = await Promise.all([
    db.from('creator_story').select(SELECT).eq('id', id).maybeSingle(),
    db.from('content_story_link').select('content_idea_id').eq('story_id', id),
  ]);
  if (!data) return null;
  return toStory(data as RawStory, (links ?? []).map((l) => l.content_idea_id));
}

export async function storyBank(): Promise<{
  stories: StoryRow[];
  coverage: PillarCoverage[];
  ready: StoryRow[];
  developing: StoryRow[];
  needsConfirmation: StoryRow[];
}> {
  const stories = await listStories({ limit: 120 });
  const vivas = stories.filter((s) => s.status !== 'archived' && s.status !== 'rejected');
  return {
    stories: vivas,
    coverage: pillarCoverage(vivas.map((s) => ({ pillar: s.pillar, status: s.status }))),
    ready: vivas.filter((s) => s.status === 'ready_to_record'),
    developing: vivas.filter((s) => s.status === 'confirmed' || s.status === 'mapped' || s.status === 'structured'),
    needsConfirmation: vivas.filter((s) => s.factStatus === 'needs_confirmation' || s.status === 'needs_confirmation'),
  };
}

/* ── Captura ──────────────────────────────────────────────────────────────── */

export async function captureStory(input: {
  text?: string;
  audioPath?: string;
  transcript?: string;
  source: StorySourceType;
  hint?: string | null;
  occurredAt?: string | null;
}): Promise<Result<{ storyId: string; needsAi: boolean }>> {
  const db = await supabaseServer();
  const { data: me } = await db.from('app_user').select('id').limit(1).maybeSingle();
  if (!me) return fail('Não encontrei o usuário.');

  const texto = (input.transcript ?? input.text ?? '').trim();
  if (!texto && !input.audioPath) return fail('Preciso do que aconteceu, escrito ou falado.');

  const excluido = excludedTopicIn(texto);
  if (excluido) {
    return fail(
      excluido === 'skincare'
        ? 'Skincare está fora da estratégia de conteúdo. Maquiagem continua dentro.'
        : 'Haircare está fora da estratégia de conteúdo.',
    );
  }

  const padrao = defaultPrivacy(input.source);
  const { data, error } = await db
    .from('creator_story')
    .insert({
      app_user_id: me.id,
      // Um título provisório: o modelo escreve um melhor na extração.
      title: texto.slice(0, 80) || 'Áudio por transcrever',
      summary: '',
      source_type: input.source,
      occurred_at: input.occurredAt ?? null,
      // `transcript` é o relato bruto, tenha vindo de áudio ou de teclado.
      // Sem isto, o texto que ela escreveu ficava só no título truncado a 80
      // caracteres e a extração não tinha o que ler.
      transcript: input.transcript ?? input.text ?? null,
      audio_path: input.audioPath ?? null,
      audio_expires_at: input.audioPath ? new Date(Date.now() + retentionHours() * 3600_000).toISOString() : null,
      factual_sequence: asJson([]),
      privacy_level: padrao.privacyLevel,
      allowed_for_content: padrao.allowedForContent,
      fact_status: padrao.factStatus,
      status: padrao.status,
      sot_version: SOT_VERSION,
      provenance: asJson({ capturedBy: 'carol', source: input.source, at: new Date().toISOString() }),
    })
    .select('id')
    .maybeSingle();

  if (error || !data) return fail(error?.message ?? 'Não consegui salvar.');
  return { ok: true, data: { storyId: data.id, needsAi: Boolean(texto) } };
}

const retentionHours = () => Number(process.env.CONTENT_AUDIO_RETENTION_HOURS ?? 24);

/** Extrai os fatos com a IA e deixa a história à espera de confirmação.
 *
 *  Nunca marca `confirmed`. A IA extrai; a confirmação é dela — é aí que o
 *  invariant vive. */
export async function extractFacts(storyId: string): Promise<Result<{ facts: string[]; questions: string[] }>> {
  const story = await getStory(storyId);
  if (!story) return fail('História não encontrada.');

  const texto = [story.transcript, story.summary, story.title].find((t) => t && t.trim()) ?? '';
  if (!texto.trim()) return fail('Ainda não há nada escrito nem transcrito.');

  const r = await runPrompt(
    extractPrompt,
    { text: texto, source: story.sourceType, hint: null },
    { entityType: 'creator_story', entityId: storyId, policyVersions: { sot: SOT_VERSION } },
  );
  if (!r.ok) return fail(r.message);

  const excluido = excludedTopicIn([r.output.title, r.output.summary, ...r.output.facts].join(' '));
  if (excluido) return fail('Esse assunto está fora da estratégia de conteúdo.');

  const db = await supabaseServer();
  const { error } = await db
    .from('creator_story')
    .update({
      title: r.output.title,
      summary: r.output.summary,
      factual_sequence: asJson(r.output.facts.map((text) => ({ text, confirmed: false }))),
      uncertain_points: asJson(r.output.uncertain_points),
      carol_quotes: asJson(r.output.carol_quotes),
      carol_meaning: r.output.stated_meaning,
      territories: r.output.candidate_territories,
      fact_status: 'needs_confirmation',
      status: 'needs_confirmation',
      ai_run_id: r.runId,
    })
    .eq('id', storyId);
  if (error) return fail(error.message);

  const c = await runPrompt(
    confirmPrompt,
    {
      title: r.output.title,
      facts: r.output.facts,
      uncertain: r.output.uncertain_points,
      hasMeaning: Boolean(r.output.stated_meaning),
    },
    { entityType: 'creator_story', entityId: storyId },
  );

  return {
    ok: true,
    data: {
      facts: r.output.facts,
      questions: c.ok ? c.output.questions.map((q) => q.text) : [],
    },
  };
}

/* ── Confirmação ──────────────────────────────────────────────────────────── */

/** A confirmação factual. É a única porta para `fact_status = 'confirmed'`. */
export async function confirmFacts(
  storyId: string,
  edits: { facts?: string[]; meaning?: string | null; privacy?: PrivacyLevel },
): Promise<Result<{ reopened: boolean }>> {
  const story = await getStory(storyId);
  if (!story) return fail('História não encontrada.');

  const antes = story.facts.map((f) => f.text);
  const depois = edits.facts ?? antes;
  if (depois.length === 0) return fail('Preciso de pelo menos um fato.');

  const excluido = excludedTopicIn(depois.join(' '));
  if (excluido) return fail('Esse assunto está fora da estratégia de conteúdo.');

  const mudou = factsEditReopens(antes, depois);
  const privacy = edits.privacy ?? story.privacyLevel;
  const now = new Date().toISOString();

  const db = await supabaseServer();
  const { error } = await db
    .from('creator_story')
    .update({
      factual_sequence: asJson(depois.map((text) => ({ text, confirmed: true }))),
      carol_meaning: edits.meaning === undefined ? story.carolMeaning : edits.meaning,
      privacy_level: privacy,
      allowed_for_content: privacy !== 'private',
      fact_status: 'confirmed',
      fact_confirmed_at: now,
      status: story.status === 'captured' || story.status === 'needs_confirmation' ? 'confirmed' : story.status,
      provenance: asJson({ ...(story as unknown as { provenance?: object }).provenance, confirmedBy: 'carol', confirmedAt: now }),
    })
    .eq('id', storyId);

  if (error) return fail(error.message);
  return { ok: true, data: { reopened: mudou } };
}

/** Editar fatos depois de a história já estar em produção reabre a
 *  confirmação. Sem isto, uma correção passava despercebida e a estrutura
 *  continuava a apontar para um fato que já não era verdade. */
export async function editFacts(storyId: string, facts: string[]): Promise<Result<{ reopened: boolean }>> {
  const story = await getStory(storyId);
  if (!story) return fail('História não encontrada.');

  const mudou = factsEditReopens(story.facts.map((f) => f.text), facts);
  const proximo = factStatusAfterEdit(factState(story), mudou);

  const db = await supabaseServer();
  const { error } = await db
    .from('creator_story')
    .update({
      factual_sequence: asJson(facts.map((text) => ({ text, confirmed: !mudou }))),
      fact_status: proximo.factStatus,
      fact_confirmed_at: proximo.factConfirmedAt,
      status: proximo.status,
    })
    .eq('id', storyId);

  if (error) return fail(error.message);
  return { ok: true, data: { reopened: mudou } };
}

export async function setMeaning(storyId: string, meaning: string): Promise<Result> {
  const db = await supabaseServer();
  const { error } = await db.from('creator_story').update({ carol_meaning: meaning }).eq('id', storyId);
  return error ? fail(error.message) : { ok: true, data: undefined };
}

export async function setPrivacy(storyId: string, level: PrivacyLevel): Promise<Result> {
  const db = await supabaseServer();
  const { error } = await db
    .from('creator_story')
    .update({ privacy_level: level, allowed_for_content: level !== 'private' })
    .eq('id', storyId);
  return error ? fail(error.message) : { ok: true, data: undefined };
}

export async function setStatus(storyId: string, status: StoryStatus): Promise<Result> {
  const story = await getStory(storyId);
  if (!story) return fail('História não encontrada.');
  const gate = canTransition(factState(story), status);
  if (!gate.ok) return fail(gate.reason);

  const db = await supabaseServer();
  const { error } = await db.from('creator_story').update({ status }).eq('id', storyId);
  return error ? fail(error.message) : { ok: true, data: undefined };
}

/* ── Mapeamento e enquadramento ───────────────────────────────────────────── */

export async function mapToPillar(storyId: string, focus: FunctionalPillar): Promise<Result<{ pillar: FunctionalPillar; reason: string }>> {
  const story = await getStory(storyId);
  if (!story) return fail('História não encontrada.');

  const gate = canStructure(factState(story));
  if (!gate.ok) return fail(gate.reason);

  const r = await runPrompt(
    mapPrompt,
    { title: story.title, facts: story.facts.map((f) => f.text), meaning: story.carolMeaning, currentFocus: focus },
    { entityType: 'creator_story', entityId: storyId },
  );
  if (!r.ok) return fail(r.message);

  const escolhido = r.output.pillars[0];
  if (!escolhido) return fail('Não consegui ver que função essa história cumpre.');

  const db = await supabaseServer();
  const { error } = await db
    .from('creator_story')
    .update({
      functional_pillar: escolhido.pillar,
      territories: r.output.territories,
      status: story.status === 'confirmed' ? 'mapped' : story.status,
    })
    .eq('id', storyId);
  if (error) return fail(error.message);

  return { ok: true, data: { pillar: escolhido.pillar, reason: escolhido.reason } };
}

export async function createFramingOptions(storyId: string): Promise<Result<{ options: { id: string; label: string; because: string }[] }>> {
  const story = await getStory(storyId);
  if (!story) return fail('História não encontrada.');

  const gate = canStructure(factState(story));
  if (!gate.ok) return fail(gate.reason);
  if (!story.pillar) return fail('Falta decidir que função essa história cumpre.');

  const r = await runPrompt(
    framingPrompt,
    {
      title: story.title,
      facts: story.facts.map((f) => f.text),
      meaning: story.carolMeaning,
      quotes: story.carolQuotes,
      pillar: story.pillar,
    },
    { entityType: 'creator_story', entityId: storyId },
  );
  if (!r.ok) return fail(r.message);

  // Um enquadramento que precise de um acontecimento que não está nos fatos é
  // recusado aqui, não mostrado a ela com um aviso.
  const { accepted } = validFrames(
    r.output.options.map((o) => ({ id: o.id, label: o.label, because: o.because, factIndexes: o.fact_indexes })),
    story.facts.length,
  );
  if (accepted.length === 0) return fail('As leituras que encontrei não se apoiam no que você contou. Prefiro não propor nenhuma.');

  const db = await supabaseServer();
  const { error } = await db.from('creator_story').update({ frame_options: asJson(accepted) }).eq('id', storyId);
  if (error) return fail(error.message);

  return { ok: true, data: { options: accepted.map((o) => ({ id: o.id, label: o.label, because: o.because })) } };
}

export async function selectFrame(storyId: string, frameId: string, customLabel?: string): Promise<Result> {
  const story = await getStory(storyId);
  if (!story) return fail('História não encontrada.');

  const opcao = story.frameOptions.find((o) => o.id === frameId);
  const label = customLabel?.trim() || opcao?.label;
  if (!label) return fail('Não reconheço esse ponto.');

  const db = await supabaseServer();
  const { error } = await db
    .from('creator_story')
    .update({ frame_id: customLabel ? 'custom' : frameId, frame_label: label })
    .eq('id', storyId);
  return error ? fail(error.message) : { ok: true, data: undefined };
}

/* ── Estrutura ────────────────────────────────────────────────────────────── */

export async function buildStructure(storyId: string): Promise<Result<{ beats: number; suggestions: number }>> {
  const story = await getStory(storyId);
  if (!story) return fail('História não encontrada.');

  const gate = contentGate({
    story: factState(story),
    pillar: story.pillar,
    text: [story.title, story.summary, ...story.facts.map((f) => f.text)].join(' '),
  });
  if (!gate.ok) return fail(gate.reason);
  if (!story.frameLabel) return fail('Falta escolher qual é a parte que você quer contar.');

  const { describeBrollBank, brollBank } = await import('@/modules/creator/content-os-service');
  const broll = await brollBank(20).then(describeBrollBank).catch(() => '');

  const r = await runPrompt(
    structurePrompt,
    {
      title: story.title,
      facts: story.facts.map((f) => f.text),
      meaning: story.carolMeaning,
      quotes: story.carolQuotes,
      frame: story.frameLabel,
      pillar: gate.pillar,
      broll,
    },
    { entityType: 'creator_story', entityId: storyId, policyVersions: { sot: SOT_VERSION } },
  );
  if (!r.ok) return fail(r.message);

  const beats = r.output.beats.map((b) => ({ order: b.order, purpose: b.purpose, intent: b.intent, factIndexes: b.fact_indexes }));
  // Beats sem fato de apoio ficam marcados como sugestão em vez de passarem
  // por fato. É o que a tela mostra com «vem do que você contou» ou não.
  const sugestoes = unsupportedBeats({ beats }, story.facts.length);

  const db = await supabaseServer();
  const { error } = await db
    .from('creator_story')
    .update({
      structure: asJson({
        centralPoint: r.output.central_point,
        frame: { id: story.frameId, label: story.frameLabel },
        beats,
        visualSupport: r.output.visual_support,
        mustNotInvent: r.output.must_not_invent,
        durationSeconds: r.output.suggested_duration_seconds,
        durationReason: r.output.duration_reason,
        format: r.output.format,
        suggestionBeats: sugestoes.map((b) => b.order),
        sourceVersion: SOT_VERSION,
      }),
      status: 'structured',
    })
    .eq('id', storyId);
  if (error) return fail(error.message);

  return { ok: true, data: { beats: beats.length, suggestions: sugestoes.length } };
}

/** O roteiro. Recusa se a UI for contornada — é a mesma regra, no mesmo sítio. */
export async function generateScript(storyId: string): Promise<Result<{ script: string; grounded: boolean }>> {
  const story = await getStory(storyId);
  if (!story) return fail('História não encontrada.');

  const gate = canGenerateScript(factState(story), {
    hasFrame: Boolean(story.frameLabel),
    hasStructure: Boolean(story.structure),
  });
  if (!gate.ok) return fail(gate.reason);

  const s = story.structure as {
    centralPoint?: string;
    beats?: { order: number; purpose: string; intent: string }[];
    durationSeconds?: number;
  };

  const r = await runPrompt(
    scriptPrompt,
    {
      title: story.title,
      centralPoint: s.centralPoint ?? story.frameLabel ?? '',
      beats: (s.beats ?? []).map((b) => `${b.order}. ${b.purpose}: ${b.intent}`).join('\n'),
      quotes: story.carolQuotes,
      facts: story.facts.map((f) => f.text),
      duration: s.durationSeconds ?? 45,
    },
    { entityType: 'creator_story', entityId: storyId },
  );
  if (!r.ok) return fail(r.message);

  // Uma citação atribuída a ela tem de existir no material dela. Sem isto, o
  // modelo pode devolver uma frase inventada dentro de `source_quotes`.
  const fontes = [...story.carolQuotes, story.transcript ?? '', ...story.facts.map((f) => f.text)];
  const grounded = r.output.source_quotes.every((q) => quoteIsGrounded(q, fontes));

  const db = await supabaseServer();
  await db
    .from('creator_story')
    .update({
      structure: asJson({ ...(story.structure ?? {}), script: r.output.script, takes: r.output.takes, scriptGrounded: grounded }),
    })
    .eq('id', storyId);

  return { ok: true, data: { script: r.output.script, grounded } };
}

/* ── Ligação ao conteúdo ──────────────────────────────────────────────────── */

/** Promove uma história estruturada a peça de conteúdo.
 *
 *  É o único caminho de uma história para `creator_content_idea`, e por isso o
 *  único sítio onde o invariant tem de ser verificado outra vez. */
export async function promoteToContent(storyId: string): Promise<Result<{ contentId: string }>> {
  const story = await getStory(storyId);
  if (!story) return fail('História não encontrada.');

  const gate = contentGate({
    story: factState(story),
    pillar: story.pillar,
    text: [story.title, ...story.facts.map((f) => f.text)].join(' '),
  });
  if (!gate.ok) return fail(gate.reason);
  if (!story.structure) return fail('Falta a estrutura antes de virar peça.');

  const s = story.structure as { centralPoint?: string; format?: string; durationSeconds?: number };
  const db = await supabaseServer();
  const { data: me } = await db.from('app_user').select('id').limit(1).maybeSingle();
  if (!me) return fail('Não encontrei o usuário.');

  const { data, error } = await db
    .from('creator_content_idea')
    .insert({
      app_user_id: me.id,
      story_id: storyId,
      functional_pillar: gate.pillar,
      territories: story.territories,
      central_point: s.centralPoint ?? story.frameLabel ?? '',
      structure_json: asJson(story.structure),
      lifecycle: 'active',
      title: story.title,
      hook: '',
      pillar: '',
      platform: 'instagram',
      // A impressão digital continua a servir para não repetir o mesmo ângulo
      // duas semanas seguidas. Aqui usa o pilar funcional, que é o que agora
      // identifica a peça.
      fingerprint: ideaFingerprint({ platform: 'instagram', pillar: gate.pillar, hook: s.centralPoint ?? '', title: story.title }),
      format: s.format ?? 'talking_head',
      status: 'saved',
      plan_date: new Date().toISOString().slice(0, 10),
      duration_seconds: s.durationSeconds ?? null,
      fact_source_version: SOT_VERSION,
      source_reason: 'Nasceu de uma situação real confirmada por ela.',
      provenance: 'creator_story',
    })
    .select('id')
    .maybeSingle();

  if (error || !data) return fail(error?.message ?? 'Não consegui criar a peça.');

  await db.from('content_story_link').insert({ story_id: storyId, content_idea_id: data.id, relation: 'primary' });
  await db.from('creator_story').update({ status: 'ready_to_record' }).eq('id', storyId);

  return { ok: true, data: { contentId: data.id } };
}

/* ── Sugestões ────────────────────────────────────────────────────────────── */

/** As histórias que podem ser sugeridas hoje. Privada, descartada e já usada
 *  ficam de fora — e é aqui que a regra é aplicada, não na tela. */
export async function suggestableStories(pillar?: FunctionalPillar): Promise<StoryRow[]> {
  const db = await supabaseServer();
  const { data } = await db
    .from('creator_story')
    .select(SELECT)
    .in('status', ['confirmed', 'mapped', 'structured', 'ready_to_record'])
    .order('captured_at', { ascending: false })
    .limit(60);

  const { data: usadas } = await db.from('content_story_link').select('story_id');
  const jaUsadas = new Set((usadas ?? []).map((l) => l.story_id));

  return (data ?? [])
    .map((r) => toStory(r as RawStory))
    .filter((s) =>
      eligibleForSuggestion({
        ...factState(s),
        id: s.id,
        title: s.title,
        pillar: s.pillar,
        usedByContentId: jaUsadas.has(s.id) ? 'usada' : null,
      }),
    )
    .filter((s) => (pillar ? s.pillar === pillar : true));
}

/* ── Áudio ────────────────────────────────────────────────────────────────── */

/** Apaga áudio bruto expirado.
 *
 *  Depois da transcrição confirmada, o ficheiro não serve para mais nada e é
 *  o dado mais sensível que este módulo guarda. */
export async function cleanupExpiredAudio(now = new Date()): Promise<{ deleted: number; failures: string[] }> {
  const db = supabaseService();
  const { data } = await db
    .from('creator_story')
    .select('id, audio_path')
    .not('audio_path', 'is', null)
    .lt('audio_expires_at', now.toISOString())
    .limit(50);

  const falhas: string[] = [];
  let apagados = 0;

  for (const row of data ?? []) {
    if (!row.audio_path) continue;
    const { error } = await db.storage.from('story-audio').remove([row.audio_path]);
    if (error) {
      falhas.push(`áudio ${row.id}: ${error.message.slice(0, 120)}`);
      continue;
    }
    await db.from('creator_story').update({ audio_path: null, audio_expires_at: null }).eq('id', row.id);
    apagados += 1;
  }

  return { deleted: apagados, failures: falhas };
}
