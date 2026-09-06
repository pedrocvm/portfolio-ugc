'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import {
  buildStructure,
  captureStory,
  confirmFacts,
  createFramingOptions,
  editFacts,
  extractFacts,
  generateScript,
  mapToPillar,
  promoteToContent,
  selectFrame,
  setMeaning,
  setPrivacy,
  setStatus,
} from '@/modules/content-brain/service';
import { adoptSeries, buildWeekPlan, decideCandidate } from '@/modules/content-brain/plan-service';
import { transcribeStoryAudio } from '@/modules/content-brain/transcription';
import type { FunctionalPillar, LensPreference, PrivacyLevel, StoryStatus } from '@/modules/content-brain/domain';
import type { LensSummary } from '@/modules/content-brain/lens-service';
import { confirmTrial, linkMedia, markLinkPrompted } from '@/modules/integrations/instagram/service';
import { lensPickerData, recordLensEvent, setLensPreference } from '@/modules/content-brain/lens-service';
import { inferLensForStory } from '@/modules/content-brain/service';
import { writeGuide } from '@/modules/content-brain/guide-service';

/** As ações do Story Workshop.
 *
 *  Finas de propósito: autenticar, validar, chamar o serviço, revalidar. Toda
 *  a regra vive no domínio — se estivesse aqui, a ferramenta do assistente
 *  teria de a repetir e as duas iam divergir.
 *
 *  Nenhuma destas ações sai para fora. Publicar continua a ser outra coisa. */

export type Result = { ok: true } | { error: string };
export type ResultWith<T> = ({ ok: true } & T) | { error: string };

const refresh = () => {
  revalidatePath('/dashboard/content');
  revalidatePath('/dashboard');
};

export async function tellStory(input: {
  text?: string;
  audioPath?: string;
  occurredAt?: string | null;
  /** A direção por onde ela procurou. Ausente quando ela chegou já sabendo o
   *  que contar — nesse caso o sistema classifica depois, como inferência. */
  lensId?: string | null;
}): Promise<ResultWith<{ storyId: string; facts: string[]; questions: string[] }>> {
  await requireUser();

  const criada = await captureStory({
    text: input.text,
    audioPath: input.audioPath,
    source: input.audioPath ? 'user_audio' : 'user_text',
    occurredAt: input.occurredAt ?? null,
    lens: input.lensId ? { id: input.lensId, source: 'selected' } : null,
  });
  if (!criada.ok) return { error: criada.error };

  await recordLensEvent({ kind: 'story_started', lensId: input.lensId ?? null, storyId: criada.data.storyId });

  // Áudio: transcreve primeiro. Se falhar, o áudio fica salvo dentro da
  // retenção e ela pode tentar de novo ou escrever.
  if (input.audioPath) {
    const t = await transcribeStoryAudio(criada.data.storyId);
    if (!t.ok) {
      // A história fica guardada com o áudio. Ela pode tentar de novo ou
      // escrever — o que não se faz é perder o relato por causa de um 503.
      refresh();
      return { ok: true, storyId: criada.data.storyId, facts: [], questions: [] };
    }
  }

  const extraida = await extractFacts(criada.data.storyId);
  refresh();
  if (!extraida.ok) return { ok: true, storyId: criada.data.storyId, facts: [], questions: [] };
  return { ok: true, storyId: criada.data.storyId, facts: extraida.data.facts, questions: extraida.data.questions };
}

export async function retryTranscription(storyId: string): Promise<ResultWith<{ facts: string[]; questions: string[] }>> {
  await requireUser();
  const t = await transcribeStoryAudio(storyId);
  if (!t.ok) return { error: t.error };
  const r = await extractFacts(storyId);
  refresh();
  if (!r.ok) return { error: r.error };
  return { ok: true, facts: r.data.facts, questions: r.data.questions };
}

export async function confirmStoryFacts(input: {
  storyId: string;
  facts: string[];
  meaning?: string | null;
  privacy?: PrivacyLevel;
}): Promise<Result> {
  await requireUser();
  const r = await confirmFacts(input.storyId, { facts: input.facts, meaning: input.meaning, privacy: input.privacy });
  refresh();
  return r.ok ? { ok: true } : { error: r.error };
}

export async function correctStoryFacts(storyId: string, facts: string[]): Promise<ResultWith<{ reopened: boolean }>> {
  await requireUser();
  const r = await editFacts(storyId, facts);
  refresh();
  return r.ok ? { ok: true, reopened: r.data.reopened } : { error: r.error };
}

export async function saveStoryMeaning(storyId: string, meaning: string): Promise<Result> {
  await requireUser();
  const r = await setMeaning(storyId, meaning);
  refresh();
  return r.ok ? { ok: true } : { error: r.error };
}

export async function markStoryPrivate(storyId: string, level: PrivacyLevel): Promise<Result> {
  await requireUser();
  const r = await setPrivacy(storyId, level);
  refresh();
  return r.ok ? { ok: true } : { error: r.error };
}

export async function discardStory(storyId: string): Promise<Result> {
  await requireUser();
  const r = await setStatus(storyId, 'rejected');
  refresh();
  return r.ok ? { ok: true } : { error: r.error };
}

export async function findStoryFunction(storyId: string, focus: FunctionalPillar): Promise<ResultWith<{ pillar: string; reason: string }>> {
  await requireUser();
  const r = await mapToPillar(storyId, focus);
  refresh();
  return r.ok ? { ok: true, pillar: r.data.pillar, reason: r.data.reason } : { error: r.error };
}

export async function askForFraming(storyId: string): Promise<ResultWith<{ options: { id: string; label: string; because: string }[] }>> {
  await requireUser();
  const r = await createFramingOptions(storyId);
  refresh();
  return r.ok ? { ok: true, options: r.data.options } : { error: r.error };
}

export async function chooseStoryPoint(storyId: string, frameId: string, customLabel?: string): Promise<Result> {
  await requireUser();
  const r = await selectFrame(storyId, frameId, customLabel);
  refresh();
  return r.ok ? { ok: true } : { error: r.error };
}

export async function structureThisStory(storyId: string): Promise<ResultWith<{ beats: number; suggestions: number }>> {
  await requireUser();
  const r = await buildStructure(storyId);
  refresh();
  return r.ok ? { ok: true, beats: r.data.beats, suggestions: r.data.suggestions } : { error: r.error };
}

/** O roteiro. A action recusa mesmo quando a UI é contornada — é a mesma
 *  função de domínio que decide se o botão devia existir. */
export async function writeScript(storyId: string): Promise<ResultWith<{ script: string; grounded: boolean }>> {
  await requireUser();
  const r = await generateScript(storyId);
  refresh();
  return r.ok ? { ok: true, script: r.data.script, grounded: r.data.grounded } : { error: r.error };
}

export async function markReadyToRecord(storyId: string): Promise<ResultWith<{ contentId: string }>> {
  await requireUser();
  const r = await promoteToContent(storyId);
  refresh();
  return r.ok ? { ok: true, contentId: r.data.contentId } : { error: r.error };
}

/* ── Lentes: por onde procurar ────────────────────────────────────────────── */

/** As direções de busca para um pilar, já ordenadas.
 *
 *  Regista que foram mostradas: uma lente que sai muitas vezes e nunca dá em
 *  nada é uma lente que devia descer, e isso só se sabe medindo. */
export async function directionsFor(
  pillar: FunctionalPillar,
  visible?: number,
): Promise<ResultWith<{ intro: string; primary: LensSummary[]; more: LensSummary[] }>> {
  await requireUser();
  const dados = await lensPickerData(pillar, { visible });
  for (const l of dados.primary) {
    await recordLensEvent({ kind: 'lens_shown', lensId: l.id, pillar }).catch(() => null);
  }
  return { ok: true, intro: dados.intro, primary: dados.primary, more: dados.more };
}

export async function chooseDirection(lensId: string, pillar: FunctionalPillar): Promise<Result> {
  await requireUser();
  await recordLensEvent({ kind: 'lens_selected', lensId, pillar });
  return { ok: true };
}

/** «Não lembrei de nada.» É informação, não fracasso: fica registado e a
 *  direção desce nas próximas vezes. Nunca se gera uma história em troca. */
export async function noMemoryForDirection(lensId: string, pillar: FunctionalPillar): Promise<Result> {
  await requireUser();
  await recordLensEvent({ kind: 'lens_dismissed', lensId, pillar });
  return { ok: true };
}

export async function skipDirections(pillar: FunctionalPillar): Promise<Result> {
  await requireUser();
  await recordLensEvent({ kind: 'lens_skipped', pillar });
  return { ok: true };
}

export async function rateDirection(lensId: string, preference: LensPreference): Promise<Result> {
  await requireUser();
  const r = await setLensPreference(lensId, preference);
  refresh();
  return r.ok ? { ok: true } : { error: r.error };
}

/** Ela chegou já sabendo. Classifica-se a direção depois, como inferência. */
export async function classifyStoryDirection(storyId: string): Promise<ResultWith<{ lensId: string | null }>> {
  await requireUser();
  const r = await inferLensForStory(storyId);
  return r.ok ? { ok: true, lensId: r.data.lensId } : { error: r.error };
}

/* ── Semana ───────────────────────────────────────────────────────────────── */

export async function planThisWeek(): Promise<Result> {
  await requireUser();
  const r = await buildWeekPlan();
  refresh();
  return r.ok ? { ok: true } : { error: r.error };
}

/* ── Candidatos ───────────────────────────────────────────────────────────── */

export async function answerCandidate(candidateId: string, decision: 'saved' | 'dismissed' | 'private'): Promise<ResultWith<{ storyId: string | null }>> {
  await requireUser();
  const r = await decideCandidate(candidateId, decision);
  refresh();
  return r.ok ? { ok: true, storyId: r.storyId } : { error: r.error };
}

/* ── Séries ───────────────────────────────────────────────────────────────── */

export async function createSeries(input: {
  storyIds: string[];
  name: string;
  premise: string;
  arc: string;
  mechanism: string;
}): Promise<Result> {
  await requireUser();
  const r = await adoptSeries(input);
  refresh();
  return r.ok ? { ok: true } : { error: r.error };
}

/* ── Instagram ────────────────────────────────────────────────────────────── */

/** A confirmação do Reel Test. Uma vez só: «não lembro» também fica gravado. */
export async function answerTrialReel(mediaId: string, answer: 'yes' | 'no' | 'unknown'): Promise<Result> {
  await requireUser();
  await confirmTrial(mediaId, answer);
  refresh();
  return { ok: true };
}

export async function confirmMediaLink(input: { mediaId: string; storyId: string | null; contentIdeaId: string | null }): Promise<Result> {
  await requireUser();
  if (!input.storyId && !input.contentIdeaId) {
    await markLinkPrompted(input.mediaId);
    refresh();
    return { ok: true };
  }
  await linkMedia({
    mediaId: input.mediaId,
    storyId: input.storyId,
    contentIdeaId: input.contentIdeaId,
    confidence: null,
    source: 'carol_confirmation',
  });
  refresh();
  return { ok: true };
}

/* ── Áudio ────────────────────────────────────────────────────────────────── */

/** Onde o browser deve gravar o áudio. O caminho é do servidor para o
 *  ficheiro não poder ser posto em qualquer sítio do bucket. */
export async function audioUploadPath(contentType: string): Promise<ResultWith<{ path: string }>> {
  await requireUser();
  const { audioExtension } = await import('@/modules/content-brain/transcription');
  const db = await supabaseServer();
  const { data: me } = await db.from('app_user').select('id').limit(1).maybeSingle();
  if (!me) return { error: 'Não encontrei o usuário.' };
  return { ok: true, path: `${me.id}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${audioExtension(contentType)}` };
}

/* ── Guia ─────────────────────────────────────────────────────────────────── */

/** O que a Carol já viu do guia.
 *
 *  Nenhuma destas revalida a tela de propósito: o guia é um modal por cima do
 *  Conteúdo, e um `revalidatePath` a cada «Continuar» desmontava-lhe a página
 *  por baixo a cada etapa. O que se salva é memória para a próxima visita, não
 *  estado que a tela atual leia. */
export async function saveGuideProgress(input: {
  step?: number;
  dismissed?: boolean;
  completed?: boolean;
}): Promise<Result> {
  await requireUser();
  const agora = new Date().toISOString();
  try {
    await writeGuide({
      step: input.step,
      dismissedAt: input.dismissed ? agora : undefined,
      completedAt: input.completed ? agora : undefined,
    });
    return { ok: true };
  } catch {
    // Perder a memória do guia não pode fechar o guia à frente dela.
    return { error: 'Não consegui salvar onde você parou.' };
  }
}

export type { FunctionalPillar, StoryStatus };
