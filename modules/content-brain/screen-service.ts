/** O que as telas do Content Brain leem.
 *
 *  Uma função por tela, e nenhuma chama a IA nem a Meta: lê o que os trabalhos
 *  já prepararam. Uma tela que dispara uma chamada de modelo ao renderizar é
 *  uma tela que demora vinte segundos e custa dinheiro por cada refresh.
 *
 *  Server-only. */

import 'server-only';

import { supabaseServer } from '@/lib/supabase/server';
import {
  PILLAR_LABEL,
  SOURCE_LABEL,
  STORY_STATUS_LABEL,
  pillarCoverage,
  type FunctionalPillar,
  type PillarCoverage,
} from './domain';
import { currentWeekPlan, openCandidates, type CandidateRow } from './plan-service';
import { learningLadder, publishedPieces } from './performance-service';
import { listStories, type StoryRow } from './service';

export type ContentScreen = {
  focus: FunctionalPillar;
  weekly: {
    pillar: FunctionalPillar;
    label: string;
    rationale: string;
    slots: { kind: string; title: string; ready: boolean; purpose: string }[];
    gaps: { label: string; available: number }[];
    mappingOnly: boolean;
    hasPlan: boolean;
  };
  coverage: PillarCoverage[];
  stories: StoryRow[];
  ready: StoryRow[];
  developing: StoryRow[];
  candidates: CandidateRow[];
  trialToConfirm: { mediaId: string; caption: string; publishedAt: string; permalink: string | null }[];
  unlinkedMedia: { mediaId: string; caption: string; publishedAt: string }[];
};

/** Tudo o que a tela de Conteúdo precisa, numa passagem. */
export async function contentScreen(): Promise<ContentScreen> {
  const db = await supabaseServer();

  const [historias, plano, candidatos, ligacoes, usadas] = await Promise.all([
    listStories({ limit: 120 }),
    currentWeekPlan(),
    openCandidates(),
    db
      .from('instagram_media')
      .select('id, caption, published_at, permalink, trial_status, trial_prompted_at, media_product_type, content_idea_id, story_id, link_prompted_at')
      .order('published_at', { ascending: false })
      .limit(30),
    db.from('content_story_link').select('story_id'),
  ]);

  const jaUsadas = new Set((usadas.data ?? []).map((l) => l.story_id));
  const vivas = historias.filter((s) => s.status !== 'archived' && s.status !== 'rejected');
  const cobertura = pillarCoverage(vivas.map((s) => ({ pillar: s.pillar, status: s.status })));

  const focus = plano?.primaryPillar ?? firstNeedingWork(cobertura);
  const midias = ligacoes.data ?? [];
  const recente = new Date(Date.now() - 14 * 86400_000).toISOString();

  return {
    focus,
    weekly: {
      pillar: focus,
      label: PILLAR_LABEL[focus],
      rationale: plano?.rationale ?? rationaleWithoutPlan(cobertura, focus),
      slots: (plano?.slots ?? []).map((s) => ({
        kind: s.kind,
        title: s.kind === 'map_pillar' ? s.reason : s.title,
        ready: s.kind === 'story' ? s.ready : false,
        purpose: s.purpose,
      })),
      gaps: cobertura
        .filter((c) => c.needsMapping)
        .map((c) => ({ label: c.label, available: c.available })),
      mappingOnly: plano?.mappingOnly ?? vivas.length === 0,
      hasPlan: Boolean(plano),
    },
    coverage: cobertura,
    stories: vivas.map((s) => ({ ...s, contentIdeaIds: jaUsadas.has(s.id) ? ['usada'] : [] })),
    ready: vivas.filter((s) => s.status === 'ready_to_record'),
    developing: vivas.filter((s) => ['confirmed', 'mapped', 'structured'].includes(s.status)),
    candidates: candidatos,
    trialToConfirm: midias
      .filter((m) => m.media_product_type === 'REELS' && m.trial_status === 'unknown' && !m.trial_prompted_at && m.published_at >= recente)
      .slice(0, 5)
      .map((m) => ({ mediaId: m.id, caption: m.caption, publishedAt: m.published_at, permalink: m.permalink })),
    unlinkedMedia: midias
      .filter((m) => !m.content_idea_id && !m.story_id && !m.link_prompted_at && m.published_at >= recente)
      .slice(0, 3)
      .map((m) => ({ mediaId: m.id, caption: m.caption, publishedAt: m.published_at })),
  };
}

const firstNeedingWork = (coverage: PillarCoverage[]): FunctionalPillar =>
  coverage.find((c) => c.needsMapping)?.pillar ?? 'attraction_journey';

function rationaleWithoutPlan(coverage: PillarCoverage[], focus: FunctionalPillar): string {
  const c = coverage.find((x) => x.pillar === focus);
  const n = c?.available ?? 0;
  if (n === 0) {
    return `Ainda não tenho nenhuma situação real guardada para ${PILLAR_LABEL[focus]}. Antes de plano, matéria-prima.`;
  }
  return `Você tem ${n} ${n === 1 ? 'situação real disponível' : 'situações reais disponíveis'} em ${PILLAR_LABEL[focus]}.`;
}

/* ── Publicado ────────────────────────────────────────────────────────────── */

export async function performanceScreen() {
  const [pecas, aprendizados, conta] = await Promise.all([
    publishedPieces(30),
    learningLadder(10),
    (await supabaseServer())
      .from('instagram_account')
      .select('last_sync_at, username, status')
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    pieces: pecas.map((p) => ({
      mediaId: p.mediaId,
      permalink: p.permalink,
      caption: p.caption,
      publishedAt: p.publishedAt,
      productType: p.mediaProductType,
      trialStatus: p.trialStatus,
      storyTitle: p.storyTitle,
      pillarLabel: p.pillar ? PILLAR_LABEL[p.pillar] : null,
      readings: (p.latest?.readings ?? []).map((r) => ({ metric: r.metric, reading: r.reading, comparable: r.comparable })),
      snapshots: p.snapshots.map((s) => ({ kind: s.kind, metrics: s.metrics })),
      latestKind: p.latest?.kind ?? null,
    })),
    learnings: aprendizados.map((l) => ({
      id: l.id,
      statement: l.statement,
      ladderState: l.ladderState as 'observation' | 'signal' | 'hypothesis' | 'testing' | 'validated' | 'rejected',
      confidence: l.confidence,
      sampleSize: l.sampleSize,
    })),
    lastSyncAt: conta.data?.last_sync_at ?? null,
    account: conta.data?.username ?? null,
    accountStatus: conta.data?.status ?? null,
  };
}

/* ── Banco, para a tela ───────────────────────────────────────────────────── */

export function toBankRows(stories: readonly StoryRow[], used: ReadonlySet<string>) {
  return stories.map((s) => ({
    id: s.id,
    title: s.title,
    summary: s.summary,
    status: s.status,
    statusLabel: STORY_STATUS_LABEL[s.status],
    pillarLabel: s.pillar ? PILLAR_LABEL[s.pillar] : null,
    sourceLabel: SOURCE_LABEL[s.sourceType],
    privacyLabel: s.privacyLevel === 'private' ? 'Privada' : s.privacyLevel === 'restricted' ? 'Pedir antes' : 'Pode usar',
    isPrivate: s.privacyLevel === 'private',
    needsConfirmation: s.factStatus !== 'confirmed',
    used: used.has(s.id),
    seriesName: null,
    facts: s.facts.map((f) => f.text),
    meaning: s.carolMeaning,
    frameLabel: s.frameLabel,
  }));
}
