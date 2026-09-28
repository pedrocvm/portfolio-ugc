/** O Mapa Editorial, o Foco Atual e as definições que o PDF deixou abertas.
 *
 *  O Mapa é a fonte de verdade dos assuntos. Não é banco de ideias: uma ideia
 *  nasce depois, quando um assunto recebe prioridade e um ângulo.
 *
 *  A definição dos três pilares e dos assuntos confirmados vive em código
 *  (`editorial.ts`), versionada. O que a base guarda é o que tem estado — em
 *  que fase cada assunto está, e desde quando. É a mesma divisão das direções
 *  de busca: texto fixo numa tabela seria regra de produto sem versão.
 *
 *  Server-only. */

import 'server-only';

import { asJson } from '@/lib/supabase/json';
import { supabaseServer } from '@/lib/supabase/server';
import { strategyClient, type StrategyClient } from '@/lib/supabase/strategy';
import {
  DEFAULT_FOCUS,
  DEFAULT_SETTINGS,
  FOCUS_ITEM_LABEL,
  PILLAR,
  PILLARS,
  PILLAR_LABEL,
  SOT_TOPICS,
  TOPIC_STATE_LABEL,
  isFocusItem,
  isPillar,
  isTopicState,
  rejectedTopic,
  type FocusItem,
  type Pillar,
  type SettingsShape,
  type TopicState,
} from './editorial';

export type Result<T = void> = { ok: true; data: T } | { ok: false; error: string };
const fail = (error: string): Result<never> => ({ ok: false, error });

const db = async (c?: StrategyClient): Promise<StrategyClient> =>
  c ?? strategyClient(await supabaseServer());

async function me(c: StrategyClient): Promise<string | null> {
  const { data } = await c.from('app_user').select('id').limit(1).maybeSingle();
  return data?.id ?? null;
}

/* ── Definições ───────────────────────────────────────────────────────────── */

const SETTINGS_KEY = 'content_strategy_settings';

/** Os pontos que o PDF deixou `ABERTO` vivem aqui, configuráveis, com o
 *  default experimental documentado em `editorial.ts`. Nenhum foi preenchido
 *  por inferência: o que não foi decidido continua a ser o default e pode
 *  mudar sem tocar em código. */
export async function strategySettings(c?: StrategyClient): Promise<SettingsShape> {
  const client = await db(c);
  const { data } = await client.from('app_setting').select('value').eq('key', SETTINGS_KEY).maybeSingle();
  const guardado = (data?.value ?? {}) as Partial<SettingsShape>;
  return {
    ...DEFAULT_SETTINGS,
    ...guardado,
    objectiveTarget: { ...DEFAULT_SETTINGS.objectiveTarget, ...(guardado.objectiveTarget ?? {}) },
    version: DEFAULT_SETTINGS.version,
  };
}

export async function saveStrategySettings(patch: Partial<SettingsShape>): Promise<Result<SettingsShape>> {
  const client = await db();
  const atual = await strategySettings(client);
  const proximo: SettingsShape = {
    ...atual,
    ...patch,
    objectiveTarget: { ...atual.objectiveTarget, ...(patch.objectiveTarget ?? {}) },
    version: DEFAULT_SETTINGS.version,
  };
  const { error } = await client.from('app_setting').upsert({
    key: SETTINGS_KEY,
    value: asJson(proximo),
    description: 'Defaults ajustáveis da estratégia de conteúdo (capacidade, janela, estoque, testes).',
  });
  if (error) return fail(error.message);
  return { ok: true, data: proximo };
}

/* ── Semeadura ────────────────────────────────────────────────────────────── */

/** Põe na base os assuntos confirmados pelo PDF e o foco conhecido. Barato e
 *  idempotente: corre a cada abertura da área, como o `seedFromMentor`.
 *
 *  Nunca sobrescreve estado. Um assunto que ela pausou continua pausado
 *  mesmo que o código diga que nasce em «Agora» — quem decidiu depois foi
 *  ela. */
export async function seedEditorialMap(c?: StrategyClient): Promise<{ topics: number; focus: boolean }> {
  const client = await db(c);
  const userId = await me(client);
  if (!userId) return { topics: 0, focus: false };

  const { data: existentes } = await client
    .from('content_topic')
    .select('slug')
    .eq('app_user_id', userId);
  const jaTem = new Set((existentes ?? []).map((r) => r.slug));

  const novos = SOT_TOPICS.filter((t) => !jaTem.has(t.slug)).map((t) => ({
    app_user_id: userId,
    slug: t.slug,
    pillar_slug: t.pillar,
    label: t.label,
    how_to_treat: t.howToTreat,
    origin: 'sot',
    state: t.state,
    state_reason: 'Assunto confirmado na Source of Truth.',
  }));
  if (novos.length) await client.from('content_topic').insert(novos);

  const { data: foco } = await client
    .from('content_focus')
    .select('id')
    .eq('app_user_id', userId)
    .is('active_to', null)
    .maybeSingle();

  let criouFoco = false;
  if (!foco) {
    await client.from('content_focus').insert({
      app_user_id: userId,
      label: 'Construção de carreira em Tech UGC e Canvas UGC',
      items: [...DEFAULT_FOCUS],
      note: 'Fase declarada em 27/09/2026. Muda sem mexer nos pilares.',
    });
    criouFoco = true;
  }

  await seedTemplates(client, userId);

  return { topics: novos.length, focus: criouFoco };
}

/** Quatro templates-mãe, e nada mais. Uma biblioteca gigante está na lista do
 *  que não construir.
 *
 *  Os tokens finais de cor e tipografia estão `ABERTO` no PDF: ficam por
 *  decidir, nomeados em `pending_tokens`. Inventar um hex aqui seria
 *  transformar uma decisão pendente em facto. */
const TEMPLATES = [
  { key: 'carousel_editorial', kind: 'carousel_editorial', label: 'Carrossel editorial',
    usage: 'História, reflexão, narrativa em capítulos, identidade.' },
  { key: 'carousel_practical', kind: 'carousel_practical', label: 'Carrossel prático',
    usage: 'Breakdown, processo, case, demonstração de raciocínio.' },
  { key: 'photo_sequence', kind: 'photo_sequence', label: 'Sequência de fotos',
    usage: 'Vida real e narrativa visual.' },
  { key: 'reel_cover', kind: 'reel_cover', label: 'Capa de Reel',
    usage: 'Quando a peça precisa de capa desenhada.' },
] as const;

const PENDING_TOKENS = ['cor primária', 'cor de apoio', 'tipografia de título', 'tipografia de corpo'];

async function seedTemplates(client: StrategyClient, userId: string) {
  const { data } = await client.from('content_template').select('key').eq('app_user_id', userId);
  const jaTem = new Set((data ?? []).map((r) => r.key));
  const novos = TEMPLATES.filter((t) => !jaTem.has(t.key)).map((t) => ({
    app_user_id: userId,
    key: t.key,
    kind: t.kind,
    label: t.label,
    usage_note: t.usage,
    tokens: asJson({}),
    pending_tokens: PENDING_TOKENS,
  }));
  if (novos.length) await client.from('content_template').insert(novos);
}

/* ── Leitura do Mapa ──────────────────────────────────────────────────────── */

export type TopicRow = {
  id: string;
  slug: string;
  pillar: Pillar;
  label: string;
  howToTreat: string;
  state: TopicState;
  stateLabel: string;
  origin: string;
  lastUsedAt: string | null;
  useCount: number;
};

export type PillarView = {
  pillar: Pillar;
  label: string;
  purpose: string;
  guardrails: readonly string[];
  topics: TopicRow[];
  /** Assuntos em «Agora». É o que pode disputar a semana. */
  liveCount: number;
};

export type EditorialMap = {
  pillars: PillarView[];
  focus: { id: string; label: string; items: FocusItem[]; itemLabels: string[]; note: string; since: string } | null;
  /** Assuntos que ela criou, fora dos confirmados pelo PDF. */
  ownTopics: number;
};

export async function editorialMap(c?: StrategyClient): Promise<EditorialMap> {
  const client = await db(c);
  const [{ data: topics }, foco] = await Promise.all([
    client
      .from('content_topic')
      .select('id, slug, pillar_slug, label, how_to_treat, state, origin, last_used_at, use_count')
      .order('state', { ascending: true })
      .order('label', { ascending: true }),
    currentFocus(client),
  ]);

  const rows: TopicRow[] = (topics ?? [])
    .filter((t) => isPillar(t.pillar_slug))
    .map((t) => ({
      id: t.id,
      slug: t.slug,
      pillar: t.pillar_slug as Pillar,
      label: t.label,
      howToTreat: t.how_to_treat,
      state: isTopicState(t.state) ? t.state : 'later',
      stateLabel: TOPIC_STATE_LABEL[isTopicState(t.state) ? t.state : 'later'],
      origin: t.origin,
      lastUsedAt: t.last_used_at,
      useCount: t.use_count,
    }));

  return {
    pillars: PILLARS.map((p) => {
      const meus = rows.filter((r) => r.pillar === p);
      return {
        pillar: p,
        label: PILLAR_LABEL[p],
        purpose: PILLAR[p].purpose,
        guardrails: PILLAR[p].guardrails,
        topics: meus,
        liveCount: meus.filter((t) => t.state === 'now').length,
      };
    }),
    focus: foco,
    ownTopics: rows.filter((r) => r.origin === 'carol').length,
  };
}

export async function currentFocus(c?: StrategyClient): Promise<EditorialMap['focus']> {
  const client = await db(c);
  const { data } = await client
    .from('content_focus')
    .select('id, label, items, note, active_from')
    .is('active_to', null)
    .maybeSingle();
  if (!data) return null;
  const items = (data.items ?? []).filter(isFocusItem);
  return {
    id: data.id,
    label: data.label,
    items,
    itemLabels: items.map((i) => FOCUS_ITEM_LABEL[i]),
    note: data.note,
    since: data.active_from,
  };
}

/* ── Escrita ──────────────────────────────────────────────────────────────── */

/** Mudar de fase não apaga nada: o estado anterior fica em
 *  `content_topic_event`. É o que permite pausar um assunto sem o perder. */
export async function setTopicState(
  topicId: string,
  state: TopicState,
  reason = '',
): Promise<Result<{ state: TopicState }>> {
  if (!isTopicState(state)) return fail('Esse estado não existe.');
  const client = await db();

  const { data: atual } = await client
    .from('content_topic')
    .select('id, state')
    .eq('id', topicId)
    .maybeSingle();
  if (!atual) return fail('Não encontrei esse assunto.');
  if (atual.state === state) return { ok: true, data: { state } };

  const { error } = await client
    .from('content_topic')
    .update({ state, state_changed_at: new Date().toISOString(), state_reason: reason })
    .eq('id', topicId);
  if (error) return fail(error.message);

  await client.from('content_topic_event').insert({
    topic_id: topicId,
    from_state: atual.state,
    to_state: state,
    reason,
    actor: 'carol',
  });

  return { ok: true, data: { state } };
}

const slugify = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 48);

/** Um assunto novo dela. A recusa do Portugal como pauta acontece aqui, e não
 *  dentro de um prompt: é a decisão do PDF a virar código. */
export async function addTopic(input: {
  pillar: Pillar;
  label: string;
  howToTreat?: string;
  state?: TopicState;
}): Promise<Result<{ id: string }>> {
  if (!isPillar(input.pillar)) return fail('Esse pilar não existe.');
  const label = input.label.trim();
  if (label.length < 3) return fail('Preciso de um nome para o assunto.');

  const recusa = rejectedTopic(label);
  if (recusa) return fail(recusa);

  const client = await db();
  const userId = await me(client);
  if (!userId) return fail('Não encontrei o usuário.');

  const slug = slugify(label);
  const { data, error } = await client
    .from('content_topic')
    .insert({
      app_user_id: userId,
      slug,
      pillar_slug: input.pillar,
      label,
      how_to_treat: input.howToTreat?.trim() ?? '',
      origin: 'carol',
      state: input.state ?? 'now',
      state_reason: 'Você adicionou.',
    })
    .select('id')
    .single();

  if (error) {
    return fail(error.code === '23505' ? 'Já existe um assunto com esse nome.' : error.message);
  }
  return { ok: true, data: { id: data.id } };
}

/** Trocar de foco fecha o anterior em vez de o reescrever. O histórico é o que
 *  permite perguntar depois «o que estava em foco quando isto foi decidido». */
export async function setFocus(items: readonly FocusItem[], input: { label?: string; note?: string } = {}): Promise<Result> {
  const validos = items.filter(isFocusItem);
  if (validos.length === 0) return fail('Escolha pelo menos uma coisa para o foco.');

  const client = await db();
  const userId = await me(client);
  if (!userId) return fail('Não encontrei o usuário.');

  const agora = new Date().toISOString();
  await client.from('content_focus').update({ active_to: agora }).eq('app_user_id', userId).is('active_to', null);

  const { error } = await client.from('content_focus').insert({
    app_user_id: userId,
    label: input.label?.trim() || validos.map((i) => FOCUS_ITEM_LABEL[i]).slice(0, 2).join(' e '),
    items: [...validos],
    note: input.note?.trim() ?? '',
    active_from: agora,
  });
  if (error) return fail(error.message);
  return { ok: true, data: undefined };
}

/* ── Templates ────────────────────────────────────────────────────────────── */

export type TemplateRow = {
  id: string;
  key: string;
  label: string;
  kind: string;
  usageNote: string;
  tokens: Record<string, string>;
  pendingTokens: string[];
};

export async function visualTemplates(c?: StrategyClient): Promise<TemplateRow[]> {
  const client = await db(c);
  const { data } = await client
    .from('content_template')
    .select('id, key, label, kind, usage_note, tokens, pending_tokens')
    .eq('active', true)
    .order('key');
  return (data ?? []).map((t) => ({
    id: t.id,
    key: t.key,
    label: t.label,
    kind: t.kind,
    usageNote: t.usage_note,
    tokens: (t.tokens ?? {}) as Record<string, string>,
    pendingTokens: t.pending_tokens ?? [],
  }));
}

/** Decidir um token tira-o da lista de pendentes. Enquanto ninguém decide, o
 *  design atual continua a valer e nada é inventado. */
export async function setTemplateToken(key: string, token: string, value: string): Promise<Result> {
  const client = await db();
  const { data } = await client
    .from('content_template')
    .select('id, tokens, pending_tokens')
    .eq('key', key)
    .maybeSingle();
  if (!data) return fail('Não encontrei esse template.');

  const tokens = { ...((data.tokens ?? {}) as Record<string, string>), [token]: value };
  const { error } = await client
    .from('content_template')
    .update({
      tokens: asJson(tokens),
      pending_tokens: (data.pending_tokens ?? []).filter((t) => t !== token),
    })
    .eq('id', data.id);
  if (error) return fail(error.message);
  return { ok: true, data: undefined };
}
