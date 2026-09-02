import 'server-only';

import { aiTaskEnabled, type Flags } from '@/lib/flags';
import { asJson } from '@/lib/supabase/json';
import { supabaseServer } from '@/lib/supabase/server';
import { recordEvent } from '@/modules/activity/service';
import { runPrompt } from '@/modules/ai/gateway';
import { parseBrief } from '@/modules/ai/prompts/registry';
import type { ParsedBrief } from '@/modules/ai/schemas';
import { refreshGate } from '@/modules/production/service';

/** Parser de briefing.
 *
 *  O valor não está em extrair os campos que a marca escreveu: está em nomear
 *  os que ela não escreveu. Um briefing sem período de uso e sem número de
 *  revisões parece completo até à segunda ronda de alterações. */

/** Campos sem os quais gravar é apostar. Determinístico: não depende do modelo
 *  ter lembrança de os assinalar. */
const CRITICAL: { key: keyof ParsedBrief; label: string; question: string }[] = [
  { key: 'objective', label: 'Objetivo da campanha', question: 'Qual é o objetivo desta campanha?' },
  { key: 'product', label: 'Produto ou SKU', question: 'Qual é exatamente o produto a mostrar?' },
  { key: 'channels', label: 'Canais', question: 'Em que canais vai correr o conteúdo?' },
  { key: 'usage_period', label: 'Período de uso', question: 'Durante quanto tempo vão usar o vídeo?' },
  { key: 'deadline', label: 'Prazo', question: 'Para quando precisam da entrega?' },
  { key: 'revisions', label: 'Revisões incluídas', question: 'Quantas rondas de revisão estão incluídas?' },
];

const isEmpty = (v: unknown) =>
  v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

/** Claims que precisam sempre de olhos humanos. Health-adjacent e absolutos
 *  são os que criam problema legal, e o sistema não declara nada seguro. */
const RISKY_CLAIM = /\b(cura|curar|elimina|garante|garantido|100%|comprovad|clinicament|médic|medic|emagrec|resultado garantido|sem efeitos)/i;

export function detectGaps(brief: Partial<ParsedBrief>) {
  const gaps: string[] = [];
  const questions: string[] = [];

  for (const field of CRITICAL) {
    if (isEmpty(brief[field.key])) {
      gaps.push(field.label);
      questions.push(field.question);
    }
  }

  if (brief.paid === true && isEmpty(brief.usage_period)) {
    questions.push('Vão correr como anúncio pago: durante quanto tempo e em que plataformas?');
  }
  if (brief.raw_footage === true) {
    gaps.push('Arquivos em bruto pedidos e não contratados');
  }
  if (brief.exclusivity === true) {
    gaps.push('Exclusividade assumida no briefing');
  }

  return { gaps, questions: [...new Set(questions)] };
}

export function detectRiskFlags(brief: Partial<ParsedBrief>) {
  const flags: { code: string; severity: 'low' | 'medium' | 'high'; note: string }[] = [];

  for (const claim of [...(brief.key_messages ?? []), ...(brief.claims ?? [])]) {
    if (RISKY_CLAIM.test(claim)) {
      flags.push({
        code: 'risky_claim',
        severity: 'high',
        note: `Claim a rever antes de gravar: "${claim.slice(0, 120)}"`,
      });
    }
  }

  if (brief.raw_footage === true) {
    flags.push({ code: 'raw_footage', severity: 'medium', note: 'Arquivos em bruto são entrega e licença à parte.' });
  }
  if (brief.exclusivity === true) {
    flags.push({ code: 'exclusivity', severity: 'high', note: 'Exclusividade bloqueia marcas concorrentes: decisão humana.' });
  }
  if (brief.revisions === null || brief.revisions === undefined) {
    flags.push({ code: 'unlimited_revisions', severity: 'medium', note: 'Sem limite de revisões escrito, o escopo não tem fundo.' });
  }
  if (brief.music_licensing) {
    flags.push({ code: 'music', severity: 'low', note: `Música indicada: ${brief.music_licensing}. Confirmer licença para anúncios.` });
  }

  return flags;
}

export type BriefRow = {
  id: string;
  collaborationId: string;
  version: number;
  status: string;
  sourceKind: string;
  parsed: Partial<ParsedBrief>;
  gaps: string[];
  questions: string[];
  riskFlags: { code: string; severity: string; note: string }[];
  rawText: string;
  createdAt: string;
};

export async function briefsFor(collaborationId: string): Promise<BriefRow[]> {
  const db = await supabaseServer();
  const { data } = await db
    .from('brief')
    .select('id, collaboration_id, version, status, source_kind, parsed, gaps, questions, risk_flags, raw_text, created_at')
    .eq('collaboration_id', collaborationId)
    .order('version', { ascending: false });

  return (data ?? []).map((b) => ({
    id: b.id,
    collaborationId: b.collaboration_id,
    version: b.version,
    status: b.status,
    sourceKind: b.source_kind,
    parsed: (b.parsed ?? {}) as Partial<ParsedBrief>,
    gaps: b.gaps ?? [],
    questions: b.questions ?? [],
    riskFlags: (b.risk_flags ?? []) as BriefRow['riskFlags'],
    rawText: b.raw_text,
    createdAt: b.created_at,
  }));
}

export async function ingestBrief(input: {
  collaborationId: string;
  raw: string;
  sourceKind?: 'email' | 'pdf' | 'text' | 'document' | 'capture';
  flags: Flags;
  actorUserId: string;
}): Promise<{ ok: boolean; id?: string; error?: string; gaps?: string[] }> {
  const db = await supabaseServer();

  const { data: collab } = await db
    .from('collaboration')
    .select('id, brand_id, opportunity_id, title, brand:brand_id ( name )')
    .eq('id', input.collaborationId)
    .maybeSingle();
  if (!collab) return { ok: false, error: 'Colaboração não encontrada.' };

  const brand = collab.brand as unknown as { name: string } | null;

  let parsed: Partial<ParsedBrief> = {};
  let aiRunId: string | null = null;

  if (aiTaskEnabled(input.flags, 'ai_classification')) {
    const result = await runPrompt(
      parseBrief,
      {
        brandName: brand?.name ?? 'marca',
        productName: collab.title,
        raw: input.raw,
        today: new Date().toISOString().slice(0, 10),
      },
      { entityType: 'collaboration', entityId: input.collaborationId, cache: true },
    );
    if (result.ok) {
      parsed = result.output;
      aiRunId = result.runId;
    }
  }

  // As lacunas e os riscos são recalculados aqui, ligados ou não os modelos:
  // são regra, não interpretação.
  const { gaps, questions } = detectGaps(parsed);
  const riskFlags = [
    ...detectRiskFlags(parsed),
    ...(parsed.risk_flags ?? []),
  ].filter((f, i, all) => all.findIndex((x) => x.code === f.code && x.note === f.note) === i);

  const allQuestions = [...new Set([...questions, ...(parsed.questions_for_brand ?? [])])];

  const { data: last } = await db
    .from('brief')
    .select('version')
    .eq('collaboration_id', input.collaborationId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (last) {
    await db.from('brief').update({ status: 'superseded' }).eq('collaboration_id', input.collaborationId);
  }

  const { data, error } = await db
    .from('brief')
    .insert({
      collaboration_id: input.collaborationId,
      opportunity_id: collab.opportunity_id,
      source_kind: input.sourceKind ?? 'text',
      raw_text: input.raw.slice(0, 40_000),
      parsed: asJson(parsed),
      gaps,
      questions: allQuestions,
      risk_flags: asJson(riskFlags),
      // Um briefing com lacunas críticas nunca fica «validado». Marcá-lo como
      // pronto seria mentir à tela de produção.
      status: gaps.length ? 'incomplete' : 'parsed',
      ai_run_id: aiRunId,
      version: (last?.version ?? 0) + 1,
    })
    .select('id')
    .single();

  if (error || !data) return { ok: false, error: 'Não foi possível salvar o briefing.' };

  await recordEvent(db, {
    eventType: 'brief.received',
    brandId: collab.brand_id,
    opportunityId: collab.opportunity_id,
    collaborationId: input.collaborationId,
    actorType: 'carol',
    actorUserId: input.actorUserId,
    summary: gaps.length
      ? `Briefing recebido com ${gaps.length} lacuna(s) crítica(s).`
      : 'Briefing recebido e completo.',
    payload: { briefId: data.id, gaps, riskFlags: riskFlags.map((f) => f.code) },
    confidence: parsed.confidence ?? null,
  });

  await refreshGate(db, input.collaborationId);
  return { ok: true, id: data.id, gaps };
}

/** A Carol confirma que as lacunas foram resolvidas com a marca. Só uma pessoa
 *  pode dizer isto: o parser não sabe o que se combinou por telefone. */
export async function validateBrief(briefId: string, actorUserId: string) {
  const db = await supabaseServer();
  const { data } = await db
    .from('brief')
    .update({ status: 'validated' })
    .eq('id', briefId)
    .select('collaboration_id, opportunity_id')
    .maybeSingle();

  if (!data) return;

  const { data: collab } = await db
    .from('collaboration')
    .select('brand_id')
    .eq('id', data.collaboration_id)
    .maybeSingle();

  await recordEvent(db, {
    eventType: 'brief.validated',
    brandId: collab?.brand_id ?? null,
    opportunityId: data.opportunity_id,
    collaborationId: data.collaboration_id,
    actorType: 'carol',
    actorUserId,
    summary: 'Briefing validado. As lacunas foram resolvidas com a marca.',
    payload: { briefId },
    dedupeKey: `brief:${briefId}:validated`,
  });

  await refreshGate(db, data.collaboration_id);
}
