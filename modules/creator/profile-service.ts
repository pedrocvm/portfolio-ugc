import 'server-only';

import { asJson } from '@/lib/supabase/json';
import { supabaseService } from '@/lib/supabase/service';
import { runPrompt } from '@/modules/ai/gateway';
import { aiSetup } from '@/modules/ai/provider';
import { readCreatorProfile } from '@/modules/ai/prompts/registry';

/** O retrato da Carol como criadora.
 *
 *  A honestidade é o ponto: NÃO existe integração com a API do Instagram, e
 *  nunca se finge que se analisou um perfil a que não se chegou. O que existe
 *  é o que o CarolOS já observou — capturas, peças de conteúdo produzidas,
 *  casos publicados — mais o que for público na web sobre o perfil dela.
 *
 *  `coverage` diz de qual dos três casos se trata, e o resto do sistema lê-o:
 *  com `unknown`, o planeador de conteúdo fica conservador em vez de inventar
 *  ideias «no estilo dela» a partir de um estilo que ninguém viu. */

export const HANDLE = '@carolxqueiroz';

/** Uma semana. Um perfil de criadora não muda de um dia para o outro, e
 *  reconstruí-lo todas as manhãs era pagar uma pesquisa por nada. */
const MAX_AGE_MS = 7 * 86_400_000;

export type CreatorProfile = {
  handle: string;
  coverage: 'observed' | 'partial' | 'unknown';
  dimensions: Record<string, unknown>;
  topics: string[];
  successfulFormats: string[];
  avoidedFormats: string[];
  evidence: string[];
  sampleSize: number;
  updatedAt: string;
  /** A frase que explica o retrato a quem o lê. */
  note: string;
};

const COVERAGE_NOTE: Record<CreatorProfile['coverage'], string> = {
  observed: 'Construído a partir de conteúdo dela que o CarolOS conseguiu ver.',
  partial: 'Construído a partir de pouco material. Trata-o como um esboço.',
  unknown:
    'Não consegui ver o conteúdo dela. Isto é o que se infere do negócio, não uma análise do perfil.',
};

export async function readProfile(): Promise<CreatorProfile | null> {
  const db = supabaseService();
  const { data } = await db
    .from('creator_profile')
    .select('handle, coverage, dimensions, topics, successful_formats, avoided_formats, evidence, sample_size, updated_at')
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  const coverage = (data.coverage as CreatorProfile['coverage']) ?? 'unknown';
  return {
    handle: data.handle || HANDLE,
    coverage,
    dimensions: (data.dimensions ?? {}) as Record<string, unknown>,
    topics: (data.topics ?? []) as string[],
    successfulFormats: (data.successful_formats ?? []) as string[],
    avoidedFormats: (data.avoided_formats ?? []) as string[],
    evidence: (data.evidence ?? []) as string[],
    sampleSize: data.sample_size ?? 0,
    updatedAt: data.updated_at,
    note: COVERAGE_NOTE[coverage],
  };
}

/** O retrato, reconstruído se já tiver uma semana. */
export async function profileFresh(): Promise<CreatorProfile | null> {
  const existing = await readProfile();
  if (existing && Date.now() - Date.parse(existing.updatedAt) < MAX_AGE_MS) return existing;
  const built = await buildProfile();
  return built ?? existing;
}

export async function buildProfile(): Promise<CreatorProfile | null> {
  const db = supabaseService();
  const setup = aiSetup();
  if (!setup.provider) return null;

  const { data: me } = await db.from('app_user').select('id').limit(1).maybeSingle();
  if (!me) return null;

  // ── O que o CarolOS já viu ──────────────────────────────────────────────
  const [{ data: captures }, { data: content }, { data: cases }] = await Promise.all([
    db
      .from('capture_item')
      .select('kind, raw_input, note, created_at')
      .in('kind', ['profile', 'screenshot', 'conversation'])
      .order('created_at', { ascending: false })
      .limit(15),
    db
      .from('content_asset')
      .select('title, format, hook, core_message, script, capabilities, published_at')
      .order('created_at', { ascending: false })
      .limit(20),
    db.from('case_study').select('title, hypothesis, execution, published_at').limit(10),
  ]);

  const observado: string[] = [];
  for (const c of captures ?? []) {
    observado.push(`[captura ${c.kind} ${c.created_at.slice(0, 10)}] ${(c.raw_input ?? '').slice(0, 600)}`);
  }
  for (const c of content ?? []) {
    observado.push(
      `[peça] ${c.title} · ${c.format} · gancho: ${c.hook} · ${(c.script ?? '').slice(0, 400)}`,
    );
  }
  for (const c of cases ?? []) {
    observado.push(`[caso] ${c.title}: ${c.hypothesis} ${(c.execution ?? '').slice(0, 260)}`);
  }

  const sampleSize = observado.length;

  // ── O que é público sobre o perfil ──────────────────────────────────────
  let publico = '';
  try {
    publico = await setup.provider.search({
      model: setup.models.chat,
      system:
        'Procuras informação pública sobre um perfil de criadora de conteúdo. ' +
        'Descreve só o que conseguires mesmo ver: formatos, temas, duração, estética, frequência. ' +
        'Se não conseguires aceder ao perfil, DIZ ISSO claramente em vez de descrever à mesma. ' +
        'Nunca inventes números de seguidores nem de visualizações.',
      user: `Perfil de Instagram e TikTok: ${HANDLE} — Carolina Queiroz, UGC creator brasileira a viver em Braga, Portugal.`,
      maxTokens: 1500,
    });
  } catch {
    // Sem pesquisa continua-se: o retrato sai mais pobre e diz que saiu.
    publico = '';
  }

  const run = await runPrompt(
    readCreatorProfile,
    {
      handle: HANDLE,
      observed: publico,
      captured: observado.join('\n').slice(0, 14000),
    },
    { entityType: 'creator_profile', entityId: me.id },
  );

  if (!run.ok) return null;

  const out = run.output;
  // A cobertura declarada pelo modelo nunca supera a evidência real. Sem
  // material observado, «observed» é uma afirmação que ninguém pode fazer.
  const coverage: CreatorProfile['coverage'] =
    sampleSize === 0 && !publico.trim()
      ? 'unknown'
      : out.coverage === 'observed' && sampleSize < 5
        ? 'partial'
        : out.coverage;

  await db.from('creator_profile').upsert(
    {
      app_user_id: me.id,
      handle: HANDLE,
      dimensions: asJson(out.dimensions),
      topics: asJson(out.topics),
      successful_formats: asJson(out.successful_formats),
      avoided_formats: asJson(out.avoided_formats),
      evidence: asJson(out.evidence),
      coverage,
      sample_size: sampleSize,
      ai_run_id: run.runId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'app_user_id' },
  );

  return readProfile();
}

/** O retrato dito ao modelo, e a linha que a interface mostra.
 *
 *  Sem retrato, o texto diz que não há — em vez de deixar um buraco que o
 *  modelo enche com um estilo inventado. */
export function describeProfile(profile: CreatorProfile | null): string {
  if (!profile || profile.coverage === 'unknown') {
    return [
      'AINDA NÃO HÁ RETRATO OBSERVADO DELA.',
      'Não sabes como ela se filma, que duração prefere, nem que formatos evita.',
      'Por isso: propõe formatos simples e seguros, nada que exija uma persona que não conheces,',
      'e não afirmes que uma coisa «é o estilo dela».',
    ].join('\n');
  }

  const d = profile.dimensions as Record<string, unknown>;
  const linhas = Object.entries(d)
    .filter(([, v]) => v !== null && v !== '')
    .map(([k, v]) => `- ${k}: ${v}`);

  return [
    `Cobertura do retrato: ${profile.coverage} (${profile.sampleSize} peças observadas).`,
    profile.coverage === 'partial' ? 'É um esboço: não o trates como certeza.' : '',
    linhas.join('\n'),
    profile.topics.length ? `Temas dela: ${profile.topics.join(', ')}.` : '',
    profile.successfulFormats.length ? `Formatos que resultam: ${profile.successfulFormats.join(', ')}.` : '',
    profile.avoidedFormats.length ? `Formatos a evitar: ${profile.avoidedFormats.join(', ')}.` : '',
    profile.evidence.length ? `De onde saiu: ${profile.evidence.slice(0, 4).join('; ')}.` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
