/** Estado e telemetria das lentes.
 *
 *  A definição de cada lente vive em `lenses.ts`, em código e versionada. Aqui
 *  fica só o que é dela: quantas vezes viu, o que produziu, e o que disse que
 *  não combina.
 *
 *  A regra que este ficheiro não pode quebrar: **uma lente nunca cria uma
 *  história**. Ela só regista por que porta a Carol entrou. O portão continua
 *  a ser `canStructure`, e a história continua a nascer de um fato que ela
 *  contou ou confirmou.
 *
 *  Server-only. */

import 'server-only';

import { asJson } from '@/lib/supabase/json';
import { supabaseServer } from '@/lib/supabase/server';
import {
  LENS_LIBRARY_VERSION,
  isLensId,
  lensById,
  lensesForPillar,
  rankLenses,
  type FunctionalPillar,
  type LensPreference,
  type LensState,
  type RankedLens,
  type StoryLens,
} from './domain';
import type { Db } from './service';

const client = async (db?: Db): Promise<Db> => db ?? ((await supabaseServer()) as Db);

export type LensEventKind =
  | 'lens_shown'
  | 'lens_selected'
  | 'lens_skipped'
  | 'lens_dismissed'
  | 'story_started'
  | 'story_confirmed'
  | 'story_discarded'
  | 'content_derived';

/* ── Estado ───────────────────────────────────────────────────────────────── */

type RawState = {
  lens_id: string; times_shown: number; times_selected: number; stories_found: number;
  content_derived: number; dismissed_count: number; preference: string; last_used_at: string | null;
};

const toState = (r: RawState): LensState => ({
  lensId: r.lens_id,
  timesShown: r.times_shown,
  timesSelected: r.times_selected,
  storiesFound: r.stories_found,
  contentDerived: r.content_derived,
  dismissedCount: r.dismissed_count,
  preference: r.preference as LensPreference,
  lastUsedAt: r.last_used_at,
});

export async function lensStates(db?: Db): Promise<LensState[]> {
  const c = await client(db);
  const { data } = await c
    .from('story_lens_state')
    .select('lens_id, times_shown, times_selected, stories_found, content_derived, dismissed_count, preference, last_used_at');
  // Uma lente que saiu da biblioteca deixa de contar para o ranking, mas a
  // linha fica: apagar histórico por causa de um rename é perder o passado.
  return ((data ?? []) as RawState[]).filter((r) => isLensId(r.lens_id)).map(toState);
}

/** As lentes que já saíram nas últimas sessões, da mais recente para trás.
 *
 *  É o que impede a mesma porta de sair quatro vezes seguidas mesmo quando ela
 *  não chega a escolhê-la. */
async function recentlyShown(db: Db, limit = 6): Promise<string[]> {
  const { data } = await db
    .from('story_lens_event')
    .select('lens_id')
    .eq('kind', 'lens_selected')
    .order('occurred_at', { ascending: false })
    .limit(limit * 3);

  const vistas: string[] = [];
  for (const e of data ?? []) {
    if (e.lens_id && !vistas.includes(e.lens_id)) vistas.push(e.lens_id);
  }
  return vistas.slice(0, limit);
}

/** As lentes com aprendizado VALIDADO.
 *
 *  Só validado. Um sinal sugere e não decide — é a mesma escada de
 *  `learning.ts`, e uma lente com um conteúdo forte não vira «a melhor». */
async function validatedLenses(db: Db): Promise<string[]> {
  const { data } = await db
    .from('content_learning')
    .select('mechanism')
    .eq('ladder_state', 'validated')
    .eq('active', true);
  const ids = new Set<string>();
  for (const l of data ?? []) {
    // O mecanismo guarda `lens:<id>` quando a peça nasceu de uma lente.
    const m = (l.mechanism ?? '').match(/lens:([a-z_]+)/);
    if (m && isLensId(m[1])) ids.add(m[1]);
  }
  return [...ids];
}

/* ── Recomendação ─────────────────────────────────────────────────────────── */

export type LensChoice = {
  pillar: FunctionalPillar;
  intro: string;
  /** As que a tela mostra à primeira. */
  primary: StoryLens[];
  /** Atrás de «outras formas de procurar». */
  more: StoryLens[];
};

export async function lensChoicesFor(
  pillar: FunctionalPillar,
  opts: { visible?: number; db?: Db; now?: Date } = {},
): Promise<LensChoice> {
  const db = await client(opts.db);
  const [states, recentes, validadas] = await Promise.all([
    lensStates(db),
    recentlyShown(db),
    validatedLenses(db),
  ]);

  const ranked = rankLenses({
    pillar,
    states,
    recentlyUsed: recentes,
    validatedLenses: validadas,
    now: opts.now,
  });

  const { PILLAR_SEARCH_INTRO, VISIBLE_LENSES_DESKTOP } = await import('./lenses');
  const visible = opts.visible ?? VISIBLE_LENSES_DESKTOP;

  return {
    pillar,
    intro: PILLAR_SEARCH_INTRO[pillar],
    primary: ranked.slice(0, visible).map((r) => r.lens),
    more: ranked.slice(visible).map((r) => r.lens),
  };
}

export async function rankedFor(pillar: FunctionalPillar, db?: Db): Promise<RankedLens[]> {
  const c = await client(db);
  const [states, recentes, validadas] = await Promise.all([
    lensStates(c),
    recentlyShown(c),
    validatedLenses(c),
  ]);
  return rankLenses({ pillar, states, recentlyUsed: recentes, validatedLenses: validadas });
}

/* ── Escrita ──────────────────────────────────────────────────────────────── */

async function ensureRow(db: Db, appUserId: string, lensId: string): Promise<void> {
  await db
    .from('story_lens_state')
    .upsert(
      { app_user_id: appUserId, lens_id: lensId, library_version: LENS_LIBRARY_VERSION },
      { onConflict: 'app_user_id,lens_id', ignoreDuplicates: true },
    );
}

/** Um evento do fluxo, e o contador que lhe corresponde.
 *
 *  Telemetria do produto, não do conteúdo dela. Serve para responder a «esta
 *  camada está mesmo a ajudar a encontrar histórias?» — que é uma pergunta que
 *  só se responde medindo. */
export async function recordLensEvent(input: {
  kind: LensEventKind;
  lensId?: string | null;
  pillar?: FunctionalPillar | null;
  storyId?: string | null;
  detail?: Record<string, unknown>;
  db?: Db;
}): Promise<void> {
  const db = await client(input.db);
  const { data: me } = await db.from('app_user').select('id').limit(1).maybeSingle();
  if (!me) return;

  const lensId = input.lensId && isLensId(input.lensId) ? input.lensId : null;

  await db.from('story_lens_event').insert({
    app_user_id: me.id,
    lens_id: lensId,
    pillar: input.pillar ?? null,
    kind: input.kind,
    story_id: input.storyId ?? null,
    detail: asJson(input.detail ?? {}),
  });

  if (!lensId) return;
  await ensureRow(db, me.id, lensId);

  const agora = new Date().toISOString();
  const { data: atual } = await db
    .from('story_lens_state')
    .select('times_shown, times_selected, stories_found, content_derived, dismissed_count')
    .eq('app_user_id', me.id)
    .eq('lens_id', lensId)
    .maybeSingle();
  if (!atual) return;

  // Tipado, não `Record<string, unknown>`: o cliente do Supabase recusa um
  // objeto aberto, e é bom que recuse — assim um nome de coluna errado não
  // passa silenciosamente.
  const patch: {
    times_shown?: number; times_selected?: number; stories_found?: number;
    content_derived?: number; dismissed_count?: number;
    last_shown_at?: string; last_used_at?: string;
  } = {};
  if (input.kind === 'lens_shown') {
    patch.times_shown = atual.times_shown + 1;
    patch.last_shown_at = agora;
  }
  if (input.kind === 'lens_selected') {
    patch.times_selected = atual.times_selected + 1;
    patch.last_used_at = agora;
  }
  // «Não lembrei de nada» é informação: uma lente mostrada muitas vezes sem
  // dar em nada é uma lente que devia descer.
  if (input.kind === 'lens_dismissed') patch.dismissed_count = atual.dismissed_count + 1;
  if (input.kind === 'story_confirmed') patch.stories_found = atual.stories_found + 1;
  if (input.kind === 'content_derived') patch.content_derived = atual.content_derived + 1;

  if (Object.keys(patch).length) {
    await db.from('story_lens_state').update(patch).eq('app_user_id', me.id).eq('lens_id', lensId);
  }
}

export async function setLensPreference(
  lensId: string,
  preference: LensPreference,
  note?: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isLensId(lensId)) return { ok: false, error: 'Não reconheço esse caminho.' };
  const db = await client();
  const { data: me } = await db.from('app_user').select('id').limit(1).maybeSingle();
  if (!me) return { ok: false, error: 'Não encontrei o usuário.' };

  await ensureRow(db, me.id, lensId);
  const { error } = await db
    .from('story_lens_state')
    .update({ preference, note: note ?? null })
    .eq('app_user_id', me.id)
    .eq('lens_id', lensId);

  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Regista a lente na história.
 *
 *  Não cria história nenhuma — a história já tem de existir. `selected` é
 *  quando ela escolheu a direção antes de se lembrar; `inferred` é quando ela
 *  chegou já sabendo e o sistema classificou depois. A diferença fica gravada
 *  porque uma inferência nunca pode passar por escolha dela. */
export async function attachLensToStory(input: {
  storyId: string;
  lensId: string;
  source: 'selected' | 'inferred';
  db?: Db;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isLensId(input.lensId)) return { ok: false, error: 'Não reconheço esse caminho.' };
  const db = await client(input.db);

  const { error } = await db
    .from('creator_story')
    .update({
      story_lens_id: input.lensId,
      story_lens_version: LENS_LIBRARY_VERSION,
      story_lens_source: input.source,
    })
    .eq('id', input.storyId);

  return error ? { ok: false, error: error.message } : { ok: true };
}

/* ── Leitura para a tela ──────────────────────────────────────────────────── */

export type LensSummary = {
  id: string;
  label: string;
  description: string;
  whatToLookFor: string;
  memoryPrompts: string[];
  followUpPrompts: string[];
  abstractStructures: string[];
  preference: LensPreference;
  storiesFound: number;
};

export function describeLens(lens: StoryLens, state?: LensState): LensSummary {
  return {
    id: lens.id,
    label: lens.label,
    description: lens.description,
    whatToLookFor: lens.whatToLookFor,
    memoryPrompts: [...lens.memoryPrompts],
    followUpPrompts: [...lens.followUpPrompts],
    abstractStructures: [...lens.abstractStructures],
    preference: state?.preference ?? 'none',
    storiesFound: state?.storiesFound ?? 0,
  };
}

export async function lensPickerData(
  pillar: FunctionalPillar,
  opts: { visible?: number; db?: Db } = {},
): Promise<{ pillar: FunctionalPillar; intro: string; primary: LensSummary[]; more: LensSummary[] }> {
  const db = await client(opts.db);
  const [choice, states] = await Promise.all([lensChoicesFor(pillar, { ...opts, db }), lensStates(db)]);
  const porId = new Map(states.map((s) => [s.lensId, s]));
  return {
    pillar,
    intro: choice.intro,
    primary: choice.primary.map((l) => describeLens(l, porId.get(l.id))),
    more: choice.more.map((l) => describeLens(l, porId.get(l.id))),
  };
}

export { lensById, lensesForPillar };
