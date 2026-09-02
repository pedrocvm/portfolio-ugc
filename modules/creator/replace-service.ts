import 'server-only';

import { localDay } from '@/lib/time';
import { asJson } from '@/lib/supabase/json';
import { supabaseService } from '@/lib/supabase/service';
import { runPrompt } from '@/modules/ai/gateway';
import { planDailyContent } from '@/modules/ai/prompts/registry';
import type { ContentIdea } from '@/modules/ai/schemas';
import { contentWorthyMilestones, describeMilestones } from '@/modules/milestones/service';
import { usableTrends } from '@/modules/trends/service';
import {
  PILLAR_LABEL,
  describeStrategy,
  PLATFORM_BRIEF,
  estimateMinutes,
  freshUntilFor,
  ideaProblems,
  ideaFingerprint,
  isPillar,
  isRepeat,
  pillarPriority,
  qualityVerdict,
  describeRejections,
  type Pillar,
  type Platform,
  type RejectionReason,
} from './domain';
import { describeExemplars } from './audit-seed';
import { describeProfile, profileFresh } from './profile-service';
import { rejectedIdeas } from './plan-service';

/** «Quero outra ideia.»
 *
 *  Não é regenerar às cegas — isso devolvia a mesma coisa com outras palavras.
 *  Recebe uma direção de um toque e escreve outra na mesma plataforma, sabendo
 *  o que já foi sugerido para não repetir.
 *
 *  A ideia velha é descartada com o motivo. Fica no banco: se ela mudar de
 *  ideias, o que foi recusado ainda existe. */

/** O que se pede a seguir, motivo a motivo.
 *
 *  Uma vocabulário só: o botão que ela toca para recusar é o mesmo que dirige
 *  a alternativa. Duas listas paralelas — «recusei porque» e «quero mais» —
 *  era pedir-lhe para dizer a mesma coisa duas vezes. */
const REASON_BRIEF: Record<RejectionReason, string> = {
  off_profile:
    'A ANTERIOR NÃO ERA DELA. Fica no território dela: comunicação, cliente, marca, o dia de quem grava. Se qualquer perfil podia ter publicado isto, está errado.',
  teaching:
    'A ANTERIOR ESTAVA DANDO AULA. Menos ensinar, mais contar: uma cena concreta que aconteceu, com o que ela sentiu e o que correu mal.',
  too_hard:
    'A ANTERIOR DAVA TRABALHO DEMAIS. Menos tomadas, menos adereços, menos edição. Se der para gravar num take só, melhor.',
  seen_it:
    'A ANTERIOR JÁ ESTÁ EM TODO LUGAR. Procura o ângulo que ninguém usa, mesmo que o formato seja conhecido.',
  wrong_moment:
    'A ANTERIOR ESTAVA PRESA A ESTA SEMANA. Escolhe algo que continue certo daqui a um mês.',
};

export type ReplaceResult = { ok: true; id: string } | { ok: false; error: string };

export async function replaceIdea(ideaId: string, motivo?: RejectionReason): Promise<ReplaceResult> {
  const db = supabaseService();

  const { data: old } = await db
    .from('creator_content_idea')
    .select('id, app_user_id, platform, plan_date, pillar, hook, title')
    .eq('id', ideaId)
    .maybeSingle();

  if (!old) return { ok: false, error: 'Ideia não encontrada.' };

  const platform = old.platform as Platform;
  const now = new Date();

  const [profile, trends, milestones, history, recusadas] = await Promise.all([
    profileFresh(),
    usableTrends(6),
    contentWorthyMilestones(4),
    previousIdeas(),
    rejectedIdeas(12),
  ]);

  const ordem = pillarPriority(history.map((h) => ({ pillar: h.pillar, at: h.generatedAt })));

  const run = await runPrompt(
    planDailyContent,
    {
      today: localDay(now),
      strategy: describeStrategy(),
      profile: describeProfile(profile),
      energy: REASON_BRIEF[motivo ?? 'off_profile'],
      pillars: ordem.map((p, i) => `${i + 1}. ${p} — ${PILLAR_LABEL[p]}`).join('\n'),
      avoidPillars: PILLAR_LABEL[(isPillar(old.pillar) ? old.pillar : 'TESTEI') as Pillar],
      audienceTilt: REASON_BRIEF[motivo ?? 'off_profile'],
      trends: trends
        .map((t) => `- [${t.platform} · ${t.freshness}] ${t.title}: ${t.description} (${t.evidence[0]?.url ?? ''})`)
        .join('\n'),
      milestones: describeMilestones(milestones),
      jobs: '',
      recentIdeas: [
        `- [RECUSADA AGORA] ${old.hook}`,
        ...history.slice(0, 12).map((h) => `- [${h.platform}] ${h.hook}`),
      ].join('\n'),
      rejected: describeRejections([
        { hook: old.hook, platform: old.platform, reason: motivo ?? null },
        ...recusadas,
      ]),
      series: '',
      seeds: '',
      exemplars: describeExemplars(),
      instagramBrief: describeBrief('instagram'),
      tiktokBrief: describeBrief('tiktok'),
    },
    { entityType: 'creator_content_idea', entityId: ideaId, timeoutMs: 90_000 },
  );

  if (!run.ok) return { ok: false, error: 'Não consegui escrever outra agora. Tenta daqui a pouco.' };

  // O plano vem com as duas; aproveita-se a da plataforma que ela recusou.
  const idea: ContentIdea = platform === 'instagram' ? run.output.instagram : run.output.tiktok;

  const problemas = ideaProblems({
    hook: idea.hook,
    script: idea.script,
    title: idea.title,
    whyNow: idea.why_now,
    format: idea.format,
    onScreenText: idea.on_screen_text,
  });
  if (problemas.length) return { ok: false, error: `A alternativa não era melhor: ${problemas[0]}.` };

  const pillar: Pillar = isPillar(idea.pillar) ? idea.pillar : 'TESTEI';
  const repetida = isRepeat(
    { platform, pillar, hook: idea.hook, title: idea.title },
    [{ fingerprint: '', hook: old.hook }, ...history.map((h) => ({ fingerprint: h.fingerprint, hook: h.hook }))],
  );
  if (repetida.repeat) return { ok: false, error: 'A alternativa era a mesma ideia outra vez.' };

  const verdict = qualityVerdict({
    carolIdentity: idea.quality.carol_identity,
    story: idea.quality.story,
    proof: idea.quality.proof,
    humanConflict: idea.quality.human_conflict,
    brandSignal: idea.quality.brand_signal,
    engagement: idea.quality.engagement,
    originality: idea.quality.originality,
    recordability: idea.quality.recordability,
    platformNative: idea.quality.platform_native,
    authorityWithoutPreaching: idea.quality.authority_without_preaching,
  });
  if (verdict.verdict === 'reject') return { ok: false, error: verdict.phrase };

  const tempo = estimateMinutes({
    shots: idea.shot_list.length,
    durationSeconds: idea.duration_seconds,
    editingComplexity: idea.editing.complexity,
  });

  const { data: created, error } = await db
    .from('creator_content_idea')
    .insert({
      app_user_id: old.app_user_id,
      plan_date: old.plan_date,
      platform,
      status: 'ready',
      pillar,
      objective: idea.objective,
      format: idea.format,
      source_reason: idea.why_now,
      title: idea.title,
      hook: idea.hook,
      alt_hooks: asJson(idea.alternative_hooks),
      script: idea.script,
      shot_list: asJson(idea.shot_list.map((s) => ({ shot: s.shot, note: s.note ?? undefined, required: s.required }))),
      b_roll: asJson(idea.b_roll),
      on_screen_text: asJson(idea.on_screen_text),
      editing_plan: asJson({
        capcut: idea.editing.capcut_steps,
        transitions: idea.editing.transitions,
        pacing: idea.editing.pacing,
        sound: idea.editing.sound,
        complexity: idea.editing.complexity,
        camera: idea.camera_position,
        location: idea.location,
        props: idea.props,
      }),
      caption: idea.caption,
      cta: idea.cta,
      cover_note: idea.cover,
      posting_notes: idea.posting_notes,
      duration_seconds: idea.duration_seconds,
      estimated_record_minutes: tempo.record,
      estimated_edit_minutes: tempo.edit,
      why_it_can_work: idea.why_it_can_work,
      authority_signal: idea.authority_signal,
      engagement_mechanism: idea.engagement_mechanism,
      brand_audience_effect: idea.brand_audience_effect,
      mentorship_signal: idea.mentorship_signal,
      quality: asJson({ ...idea.quality, score: verdict.score, verdict: verdict.verdict, phrase: verdict.phrase }),
      fingerprint: ideaFingerprint({ platform, pillar, hook: idea.hook, title: idea.title }),
      fresh_until: freshUntilFor({ hasTrend: false }, now),
      generated_at: now.toISOString(),
      ai_run_id: run.runId,
    })
    .select('id')
    .maybeSingle();

  if (error || !created) return { ok: false, error: 'Não consegui salvar a alternativa.' };

  await db
    .from('creator_content_idea')
    .update({
      status: 'discarded',
      decided_at: now.toISOString(),
      rejected_reason: motivo ?? 'off_profile',
    })
    .eq('id', ideaId);

  return { ok: true, id: created.id };
}

async function previousIdeas() {
  const db = supabaseService();
  const { data } = await db
    .from('creator_content_idea')
    .select('fingerprint, hook, pillar, platform, generated_at')
    .order('generated_at', { ascending: false })
    .limit(30);

  return (data ?? []).map((r) => ({
    fingerprint: r.fingerprint,
    hook: r.hook,
    pillar: r.pillar,
    platform: r.platform,
    generatedAt: r.generated_at,
  }));
}

function describeBrief(platform: Platform): string {
  const b = PLATFORM_BRIEF[platform];
  return `objetivo: ${b.objective}\nTratamento: ${b.treatment}\nA evitar: ${b.avoid}`;
}
