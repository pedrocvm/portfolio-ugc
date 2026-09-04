'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';

/** As escritas do Conteúdo.
 *
 *  Nenhuma sai para fora. Levar um teste ao feed, publicar, apagar: isso é no
 *  Instagram, na mão dela. O que está aqui prepara, regista e aprende — e por
 *  isso nenhuma pergunta duas vezes. */

export type Result = { ok?: true; error?: string };

const refresh = () => {
  for (const p of ['/dashboard/content', '/dashboard', '/dashboard/analytics']) revalidatePath(p);
};

const uuid = z.string().uuid();
const isUuid = (v: string) => uuid.safeParse(v).success;

/* ── Reels Test Lab ───────────────────────────────────────────────────────── */

export async function toggleIntensiveTests(on: boolean): Promise<Result> {
  await requireUser();
  const { setIntensiveTestMode } = await import('@/modules/creator/content-os-service');
  await setIntensiveTestMode(on);
  refresh();
  return { ok: true };
}

/** Um print dos Insights, já no bucket `capture`. O modelo lê; ela só confirma
 *  o que ficou ambíguo. */
export type InsightsResult =
  | { error: string }
  | {
      ok: true;
      recorded: boolean;
      verdict: string | null;
      views: number | null;
      reach: number | null;
      nonFollowers: number | null;
      ambiguities: string[];
      postHint: string | null;
    };

export async function pasteInsights(input: { path: string; ideaId?: string | null; hint?: string }): Promise<InsightsResult> {
  await requireUser();
  if (input.ideaId && !isUuid(input.ideaId)) return { error: 'Ideia inválida.' };
  const { readInsights } = await import('@/modules/creator/content-os-service');
  const r = await readInsights({ storagePath: input.path, ideaId: input.ideaId ?? null, hint: input.hint });
  if (!r.ok) return { error: r.error };
  refresh();
  return {
    ok: true as const,
    recorded: Boolean(r.recorded),
    verdict: r.recorded?.verdict.because ?? null,
    views: r.extraction.views,
    reach: r.extraction.reach,
    nonFollowers: r.nonFollowerReach,
    ambiguities: r.ambiguities,
    postHint: r.extraction.post_hint,
  };
}

export async function recordNumbers(input: {
  ideaId: string;
  platform: 'instagram' | 'tiktok';
  views: number | null;
  reach?: number | null;
  nonFollowerReach?: number | null;
  likes?: number | null;
  comments?: number | null;
  saves?: number | null;
  shares?: number | null;
  notes?: string;
}): Promise<{ error: string } | { ok: true; verdict: string }> {
  await requireUser();
  if (!isUuid(input.ideaId)) return { error: 'Ideia inválida.' };
  const { recordPerformance } = await import('@/modules/creator/content-os-service');
  const r = await recordPerformance({ ...input, source: 'manual' });
  if (!r.ok) return { error: r.error };
  refresh();
  return { ok: true as const, verdict: r.verdict.because };
}

/** Ela levou o teste ao feed, no Instagram. Aqui só se regista. */
export async function promoteToFeed(ideaId: string): Promise<Result> {
  await requireUser();
  if (!isUuid(ideaId)) return { error: 'Ideia inválida.' };
  const { markPromotedToFeed } = await import('@/modules/creator/content-os-service');
  await markPromotedToFeed(ideaId);
  refresh();
  return { ok: true };
}

/** «Quero repostar.» Não igual: uma variante, com o mesmo B-roll e outro
 *  gancho. */
export async function makeVariant(ideaId: string): Promise<Result & { newId?: string }> {
  await requireUser();
  if (!isUuid(ideaId)) return { error: 'Ideia inválida.' };
  const { contentIdea, directedIdea } = await import('@/modules/creator/plan-service');
  const old = await contentIdea(ideaId);
  if (!old) return { error: 'Ideia não encontrada.' };
  const r = await directedIdea({
    directive: `VARIANTE LEGÍTIMA de uma peça que já saiu: «${old.hook}» (legenda: ${old.caption.slice(0, 200)}). Mesmo B-roll e mesmo tema, mas gancho NOVO, legenda NOVA e outro enquadramento — nunca a mesma frase. O Instagram trava o duplicado.`,
    platform: old.platform,
    track: old.track === 'reels_test' ? 'reels_test' : 'main',
    parentIdeaId: old.id,
    inheritedBrollIds: old.brollAssetIds,
    entityId: old.id,
  });
  if (!r.ok) return { error: r.because };
  refresh();
  return { ok: true, newId: r.id };
}

/* ── B-roll ───────────────────────────────────────────────────────────────── */

export async function addBrollTake(input: {
  path?: string | null;
  fileName?: string | null;
  note?: string;
  durationSeconds?: number | null;
}): Promise<{ error: string } | { ok: true; id: string; tags: string[] }> {
  await requireUser();
  if (!input.path && !(input.note ?? '').trim()) return { error: 'Diga o que é o take, ou suba o arquivo.' };
  const { registerBroll } = await import('@/modules/creator/content-os-service');
  const r = await registerBroll({ storagePath: input.path ?? null, fileName: input.fileName ?? null, note: input.note ?? '', durationSeconds: input.durationSeconds ?? null });
  if (!r.ok) return { error: r.error };
  refresh();
  return { ok: true as const, id: r.id, tags: r.tags };
}

export async function fixBrollTags(id: string, tags: string[]): Promise<Result> {
  await requireUser();
  if (!isUuid(id)) return { error: 'Take inválido.' };
  const { updateBrollTags } = await import('@/modules/creator/content-os-service');
  await updateBrollTags(id, tags);
  refresh();
  return { ok: true };
}

/* ── Prova social ─────────────────────────────────────────────────────────── */

export async function saveProof(input: { brandName: string; feedback: string; context?: string; path?: string | null }): Promise<Result & { id?: string }> {
  await requireUser();
  if (!input.brandName.trim() || !input.feedback.trim()) return { error: 'Falta a marca ou o texto do feedback.' };
  const { saveSocialProof } = await import('@/modules/creator/content-os-service');
  const r = await saveSocialProof({ brandName: input.brandName, feedback: input.feedback, context: input.context, screenshotPath: input.path ?? null, source: input.path ? 'screenshot' : 'manual' });
  if (!r.ok) return { error: r.error };
  refresh();
  return { ok: true, id: r.id };
}

/** Só ela regista a permissão. Sem isto, nada com o nome da marca sai. */
export async function setProofPermission(id: string, permission: 'unknown' | 'requested' | 'granted' | 'denied'): Promise<Result> {
  await requireUser();
  if (!isUuid(id)) return { error: 'Registro inválido.' };
  const { setSocialProofPermission } = await import('@/modules/creator/content-os-service');
  await setSocialProofPermission(id, permission);
  refresh();
  return { ok: true };
}

/** «Esse feedback pode virar um conteúdo.» Com permissão cita a marca; sem
 *  ela, mostra o processo e não a nomeia. */
export async function proofToContent(proofId: string): Promise<Result & { newId?: string }> {
  await requireUser();
  if (!isUuid(proofId)) return { error: 'Registro inválido.' };
  const { socialProofVault } = await import('@/modules/creator/content-os-service');
  const proof = (await socialProofVault()).find((p) => p.id === proofId);
  if (!proof) return { error: 'Feedback não encontrado.' };
  const { directedIdea } = await import('@/modules/creator/plan-service');
  const podeCitar = proof.permission === 'granted';
  const r = await directedIdea({
    directive: `PROVA SOCIAL: uma marca${podeCitar ? ` (${proof.brandName})` : ''} deu este feedback sobre o trabalho dela: «${proof.feedback || proof.context}». ${
      podeCitar
        ? 'A permissão está registada: podes citar a marca e o feedback.'
        : 'NÃO há permissão registada: não cites a marca nem o texto literal. Mostra o processo que a marca valorizou — o que ela pesquisou, decidiu e entregou.'
    } Função: converter, em modo autoridade. Documenta, não ensina.`,
    platform: 'instagram',
    track: 'journey',
    entityId: proof.id,
  });
  if (!r.ok) return { error: r.because };
  const { supabaseService } = await import('@/lib/supabase/service');
  await supabaseService().from('social_proof').update({ content_idea_id: r.id }).eq('id', proofId);
  refresh();
  return { ok: true, newId: r.id };
}

/* ── Séries e experiências ────────────────────────────────────────────────── */

export async function findBragaPlaces(): Promise<{ error: string } | { ok: true; added: number }> {
  await requireUser();
  const { discoverBragaPlaces } = await import('@/modules/creator/content-os-service');
  const r = await discoverBragaPlaces();
  if (!r.ok) return { error: r.error };
  refresh();
  return { ok: true, added: r.added };
}

export async function bragaEpisode(placeName?: string): Promise<Result & { newId?: string }> {
  await requireUser();
  const { bragaSeries, updateBragaPlace } = await import('@/modules/creator/content-os-service');
  const s = await bragaSeries();
  const place = s?.places.find((p) => p.name === placeName) ?? s?.nextPlaces[0] ?? null;
  const { directedIdea } = await import('@/modules/creator/plan-service');
  const r = await directedIdea({
    directive: `EPISÓDIO DA SÉRIE «BRAGA REAL»${place ? `, no lugar «${place.name}» (${place.kind}): ${place.why} O que ela repararia: ${place.angle}` : ''}. Braga vista por quem passou dez anos numa sala: serviço, ritmo, gente, a conta — nunca «top 5 instagramáveis», nunca roteiro turístico. Função: atrair e conectar, modo pessoal + autoridade. Declara a série com este nome exato: Braga Real.`,
    platform: 'instagram',
    track: 'braga_real',
  });
  if (!r.ok) return { error: r.because };
  if (place) await updateBragaPlace(place.name, { ideaId: r.id });
  refresh();
  return { ok: true, newId: r.id };
}

export async function bragaPlaceDone(name: string, patch: { visited?: boolean; recorded?: boolean; published?: boolean }): Promise<Result> {
  await requireUser();
  const { updateBragaPlace } = await import('@/modules/creator/content-os-service');
  await updateBragaPlace(name, patch);
  refresh();
  return { ok: true };
}

export async function englishPiece(): Promise<Result & { newId?: string }> {
  await requireUser();
  const { directedIdea } = await import('@/modules/creator/plan-service');
  const r = await directedIdea({
    directive: 'EXPERIÊNCIA DE INGLÊS: uma peça por semana, falada em inglês com guião, sobre algo que ela viveu — não inglês decorativo na tela. Se houver uma marca internacional fechada nos marcos, é o contexto legítimo; se não, a jornada de uma brasileira construindo negócio em Portugal.',
    platform: 'instagram',
    track: 'english',
    language: 'en',
  });
  if (!r.ok) return { error: r.because };
  refresh();
  return { ok: true, newId: r.id };
}

export async function craftPiece(): Promise<Result & { newId?: string }> {
  await requireUser();
  const { directedIdea } = await import('@/modules/creator/plan-service');
  const r = await directedIdea({
    directive: 'PROVA DE OFÍCIO DE EDIÇÃO: um take real dela, do bruto ao final, mostrando a decisão que mudou o vídeo — «esse corte parecia errado até eu esconder isto aqui». Timeline à vista, antes/depois. Educa e gera saves sem virar tutorial. Função: educar e reter, modo autoridade + informação.',
    platform: 'instagram',
    track: 'capcut',
  });
  if (!r.ok) return { error: r.because };
  refresh();
  return { ok: true, newId: r.id };
}

export async function setExperiment(kind: string, status: 'planned' | 'running' | 'paused'): Promise<Result> {
  await requireUser();
  const { setExperimentStatus } = await import('@/modules/creator/content-os-service');
  await setExperimentStatus(kind, status);
  refresh();
  return { ok: true };
}

/* ── Referências ──────────────────────────────────────────────────────────── */

export async function deconstructRef(input: { text: string; url?: string | null }): Promise<{ error: string } | { ok: true; deconstruction: import('@/modules/ai/schemas').ReferenceDeconstruction }> {
  await requireUser();
  if (input.text.trim().length < 20) return { error: 'Descreva o vídeo (ou cole a transcrição): o que aparece, o que diz, como corta.' };
  const { deconstruct } = await import('@/modules/creator/content-os-service');
  const r = await deconstruct({ reference: input.text, url: input.url ?? null });
  if (!r.ok) return { error: r.error };
  refresh();
  return { ok: true as const, deconstruction: r.deconstruction };
}
