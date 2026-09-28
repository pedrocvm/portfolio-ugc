/** Gerar, validar e editar o Production Pack.
 *
 *  Três portões, por esta ordem:
 *
 *  1. **Aprovação estratégica primeiro.** Não existe pack antes de ela aceitar
 *     assunto, ângulo e formato. O roteiro não chega «pronto» antes da decisão.
 *  2. **Sem matéria-prima confirmada não há pack.** É o invariant mais antigo
 *     deste módulo e continua de pé: a IA organiza o que aconteceu, não
 *     inventa o que aconteceu.
 *  3. **Validação humana antes de «pronto para produzir».** O estado muda
 *     porque ela carregou, nunca porque a geração terminou.
 *
 *  Server-only. */

import 'server-only';

import { asJson } from '@/lib/supabase/json';
import { supabaseServer } from '@/lib/supabase/server';
import { strategyClient, type StrategyClient } from '@/lib/supabase/strategy';
import { runPrompt } from '@/modules/ai/gateway';
import { isFormat, isModality, isObjective, isPillar, type Format, type Modality } from './editorial';
import { dnaFromPack } from './format-dna';
import {
  PACK_DELIVERABLES,
  PACK_LABEL,
  isPackKind,
  packGaps,
  packKindFor,
  parsePack,
  type PackKind,
  type PackPayload,
} from './pack';
import { PACK_PROMPT } from './pack-prompts';
import { canTransition, isProposalStatus } from './pipeline';

export type Result<T = void> = { ok: true; data: T } | { ok: false; error: string };
const fail = (error: string): Result<never> => ({ ok: false, error });

/** Um erro que a tela trata de outra maneira: não é falha, é um passo que
 *  falta. Leva a Carol a contar o que aconteceu, não a tentar outra vez. */
export const NEEDS_RAW_MATERIAL = 'NEEDS_RAW_MATERIAL';

const client = async (c?: StrategyClient): Promise<StrategyClient> =>
  c ?? strategyClient(await supabaseServer());

export type PackView = {
  id: string;
  proposalId: string;
  kind: PackKind;
  kindLabel: string;
  deliverables: readonly string[];
  payload: PackPayload;
  gaps: string[];
  status: string;
  validatedAt: string | null;
  version: number;
  templateKey: string | null;
};

export async function packFor(proposalId: string, c?: StrategyClient): Promise<PackView | null> {
  const db = await client(c);
  const { data } = await db
    .from('content_production_pack')
    .select('id, proposal_id, kind, payload, gaps, status, validated_at, version, template_key')
    .eq('proposal_id', proposalId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data || !isPackKind(data.kind)) return null;

  const parsed = parsePack(data.kind, data.payload);
  if (!parsed.ok) return null;

  return {
    id: data.id,
    proposalId: data.proposal_id,
    kind: data.kind,
    kindLabel: PACK_LABEL[data.kind],
    deliverables: PACK_DELIVERABLES[data.kind],
    payload: parsed.pack,
    gaps: data.gaps ?? [],
    status: data.status,
    validatedAt: data.validated_at,
    version: data.version,
    templateKey: data.template_key,
  };
}

/** Gera o pack do formato certo para uma proposta já aprovada. */
export async function generatePack(proposalId: string): Promise<Result<{ packId: string; kind: PackKind; gaps: string[] }>> {
  const db = await client();

  const { data: p } = await db
    .from('content_proposal')
    .select('id, status, approved_at, topic_label, angle, pillar_slug, objective, format, commercial_modality, story_id, experiment_id')
    .eq('id', proposalId)
    .maybeSingle();
  if (!p) return fail('Não encontrei essa proposta.');
  if (!isProposalStatus(p.status)) return fail('Estado desconhecido.');

  if (!p.approved_at) {
    return fail('O roteiro não nasce antes da decisão. Aprove a proposta primeiro.');
  }
  if (!isFormat(p.format) || !isPillar(p.pillar_slug) || !isObjective(p.objective)) {
    return fail('A proposta está incompleta.');
  }

  const modality: Modality = isModality(p.commercial_modality) ? p.commercial_modality : 'none';
  const kind = packKindFor(p.format as Format, modality);

  // O portão da matéria-prima. Não é uma verificação de conveniência: é a
  // regra que impede o sistema de escrever uma história que não aconteceu.
  const material = await rawMaterial(db, p.story_id);
  if (!material) {
    return fail(NEEDS_RAW_MATERIAL);
  }

  const referencia = await referenceStructure(db, p.experiment_id);

  const r = await runPrompt(
    PACK_PROMPT[kind],
    {
      topic: p.topic_label,
      angle: p.angle,
      pillar: p.pillar_slug,
      objective: p.objective,
      facts: material.facts,
      quotes: material.quotes,
      reference: referencia?.structure ?? null,
      experiment: referencia?.question ?? null,
    },
    { entityType: 'content_proposal', entityId: proposalId },
  );
  if (!r.ok) return fail(r.message);

  const parsed = parsePack(kind, r.output);
  if (!parsed.ok) return fail(`O material voltou com a forma errada: ${parsed.problems.join('; ')}`);

  const gaps = packGaps(parsed.pack);

  const { data: anterior } = await db
    .from('content_production_pack')
    .select('id, version')
    .eq('proposal_id', proposalId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (anterior) {
    // Uma versão nova não apaga a anterior: o histórico é o que permite ver o
    // que mudou depois de ela pedir ajuste.
    await db.from('content_production_pack').update({ status: 'superseded' }).eq('id', anterior.id);
  }

  const { data: pack, error } = await db
    .from('content_production_pack')
    .insert({
      proposal_id: proposalId,
      kind,
      payload: asJson(parsed.pack.body as unknown as Record<string, unknown>),
      gaps,
      story_id: p.story_id,
      status: 'to_validate',
      version: (anterior?.version ?? 0) + 1,
      ai_run_id: r.runId ?? null,
    })
    .select('id')
    .single();
  if (error) return fail(error.message);

  await saveDna(db, proposalId, parsed.pack, p.format as Format, modality);

  const check = canTransition(p.status, 'to_validate', { approved: true, validated: false });
  if (check.ok) {
    await db.from('content_proposal').update({ status: 'to_validate' }).eq('id', proposalId);
    await db.from('content_proposal_event').insert({
      proposal_id: proposalId,
      from_status: p.status,
      to_status: 'to_validate',
      actor: 'system',
      note: `Pack ${PACK_LABEL[kind]} gerado.`,
    });
  }

  return { ok: true, data: { packId: pack.id, kind, gaps } };
}

/** Os fatos confirmados por ela e as palavras dela. Sem isto não há geração. */
async function rawMaterial(
  db: StrategyClient,
  storyId: string | null,
): Promise<{ facts: string[]; quotes: string[] } | null> {
  if (!storyId) return null;
  const { data } = await db
    .from('creator_story')
    .select('factual_sequence, carol_quotes, carol_meaning, fact_status')
    .eq('id', storyId)
    .maybeSingle();
  if (!data || data.fact_status !== 'confirmed') return null;

  const sequence = Array.isArray(data.factual_sequence) ? data.factual_sequence : [];
  const facts = sequence
    .map((f) => (f && typeof f === 'object' && 'text' in f ? String((f as { text: unknown }).text) : ''))
    .filter(Boolean);
  if (facts.length === 0) return null;

  const quotes = (Array.isArray(data.carol_quotes) ? data.carol_quotes : []).map(String).filter(Boolean);
  if (data.carol_meaning) quotes.push(String(data.carol_meaning));

  return { facts, quotes };
}

async function referenceStructure(
  db: StrategyClient,
  experimentId: string | null,
): Promise<{ structure: string | null; question: string | null } | null> {
  if (!experimentId) return null;
  const { data } = await db
    .from('content_experiment')
    .select('question, hypothesis')
    .eq('id', experimentId)
    .maybeSingle();
  if (!data) return null;
  return { structure: null, question: data.question || data.hypothesis || null };
}

async function saveDna(
  db: StrategyClient,
  proposalId: string,
  pack: PackPayload,
  format: Format,
  modality: Modality,
) {
  const dna = dnaFromPack({ pack, format, modality });
  await db.from('content_format_dna').upsert(
    {
      proposal_id: proposalId,
      format: dna.format,
      presentation: dna.presentation,
      construction: dna.construction,
      presence: dna.presence,
      opening: dna.opening,
      pace: dna.pace,
      audio: dna.audio,
      duration_band: dna.durationBand,
      on_screen_text: dna.onScreenText,
      modality: dna.modality,
      source: dna.source,
      confidence: dna.confidence,
    },
    { onConflict: 'proposal_id' },
  );
}

/* ── Edição e validação ───────────────────────────────────────────────────── */

/** Ela corrige o material. Volta a passar pelo schema: um pack editado à mão
 *  tem de continuar a ser um pack. */
export async function editPack(packId: string, payload: unknown): Promise<Result<{ gaps: string[] }>> {
  const db = await client();
  const { data } = await db
    .from('content_production_pack')
    .select('id, kind, status')
    .eq('id', packId)
    .maybeSingle();
  if (!data || !isPackKind(data.kind)) return fail('Não encontrei esse material.');
  if (data.status === 'superseded') return fail('Essa versão já foi substituída.');

  const parsed = parsePack(data.kind, payload);
  if (!parsed.ok) return fail(parsed.problems.join('; '));

  const gaps = packGaps(parsed.pack);
  const { error } = await db
    .from('content_production_pack')
    .update({ payload: asJson(parsed.pack.body as unknown as Record<string, unknown>), gaps })
    .eq('id', packId);
  if (error) return fail(error.message);

  return { ok: true, data: { gaps } };
}

export async function setPackTemplate(packId: string, templateKey: string): Promise<Result> {
  const db = await client();
  const { error } = await db.from('content_production_pack').update({ template_key: templateKey }).eq('id', packId);
  if (error) return fail(error.message);
  return { ok: true, data: undefined };
}

/** A validação é dela. É o único caminho para «pronto para produzir», e a
 *  transição é recusada se ainda houver lacunas. */
export async function validatePack(packId: string): Promise<Result<{ proposalId: string }>> {
  const db = await client();
  const { data: pack } = await db
    .from('content_production_pack')
    .select('id, proposal_id, kind, payload, gaps, status')
    .eq('id', packId)
    .maybeSingle();
  if (!pack || !isPackKind(pack.kind)) return fail('Não encontrei esse material.');

  const parsed = parsePack(pack.kind, pack.payload);
  if (!parsed.ok) return fail('O material está incompleto.');
  const gaps = packGaps(parsed.pack);
  if (gaps.length) return fail(`Ainda falta: ${gaps.join('; ')}.`);

  const { data: p } = await db
    .from('content_proposal')
    .select('id, status, approved_at')
    .eq('id', pack.proposal_id)
    .maybeSingle();
  if (!p || !isProposalStatus(p.status)) return fail('Não encontrei a proposta.');

  const agora = new Date().toISOString();
  const check = canTransition(p.status, 'ready_to_produce', { approved: Boolean(p.approved_at), validated: true });
  if (!check.ok) return fail(check.because);

  await db.from('content_production_pack').update({ status: 'validated', validated_at: agora, gaps: [] }).eq('id', packId);
  await db.from('content_proposal').update({ status: 'ready_to_produce', validated_at: agora }).eq('id', p.id);
  await db.from('content_proposal_event').insert({
    proposal_id: p.id,
    from_status: p.status,
    to_status: 'ready_to_produce',
    actor: 'carol',
    note: 'Material validado.',
  });

  return { ok: true, data: { proposalId: p.id } };
}

/** «Quero ajustar» no material: volta a desenvolver, e a próxima geração cria
 *  a versão seguinte. Não descarta nada. */
export async function reopenPack(proposalId: string, note = ''): Promise<Result> {
  const db = await client();
  const { data: p } = await db
    .from('content_proposal')
    .select('id, status, approved_at')
    .eq('id', proposalId)
    .maybeSingle();
  if (!p || !isProposalStatus(p.status)) return fail('Não encontrei a proposta.');

  const check = canTransition(p.status, 'approved_to_develop', { approved: Boolean(p.approved_at), validated: false });
  if (!check.ok) return fail(check.because);

  await db.from('content_proposal').update({ status: 'approved_to_develop' }).eq('id', proposalId);
  await db.from('content_proposal_event').insert({
    proposal_id: proposalId,
    from_status: p.status,
    to_status: 'approved_to_develop',
    actor: 'carol',
    note: note || 'Pediu ajuste no material.',
  });
  return { ok: true, data: undefined };
}

/** Liga uma história confirmada a uma proposta. É o passo entre «aprovada» e
 *  «pack gerado» quando ainda não havia matéria-prima. */
export async function attachStory(proposalId: string, storyId: string): Promise<Result> {
  const db = await client();
  const { data } = await db.from('creator_story').select('id, fact_status').eq('id', storyId).maybeSingle();
  if (!data) return fail('Não encontrei essa história.');
  if (data.fact_status !== 'confirmed') return fail('Confirme os fatos dessa história primeiro.');

  const { error } = await db.from('content_proposal').update({ story_id: storyId }).eq('id', proposalId);
  if (error) return fail(error.message);
  return { ok: true, data: undefined };
}
