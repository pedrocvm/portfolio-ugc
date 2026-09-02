import 'server-only';

import { asJson } from '@/lib/supabase/json';
import { supabaseService } from '@/lib/supabase/service';
import { AUDIT_PROVENANCE, OBSERVED_PROFILE, SEED_IDEAS } from './audit-seed';
import { STRATEGY_SOURCE, STRATEGY_VERSION, ideaFingerprint } from './domain';

/** Pôr a auditoria dentro do sistema.
 *
 *  Três escritas, todas idempotentes: o retrato de criadora observado, a
 *  auditoria como fonte de conhecimento com autoridade declarada, e as trinta
 *  ideias como semente.
 *
 *  Idempotente importa aqui mais do que noutro lugar: isto corre no arranque do
 *  plano de conteúdo, todos os dias, e uma segunda passagem não pode duplicar
 *  trinta ideias nem apagar o que ela já decidiu sobre elas. */

export type SeedResult = { profile: boolean; source: boolean; ideas: number };

export async function seedFromAudit(): Promise<SeedResult> {
  const db = supabaseService();
  const { data: me } = await db.from('app_user').select('id').limit(1).maybeSingle();
  if (!me) return { profile: false, source: false, ideas: 0 };

  const profile = await seedProfile(me.id);
  const source = await seedKnowledgeSource();
  const ideas = await seedIdeas(me.id);

  return { profile, source, ideas };
}

/** O retrato observado.
 *
 *  Substitui um retrato construído por inferência, mas **não** substitui um que
 *  já tenha sido observado mais tarde: se alguém vier a analisar o perfil outra
 *  vez com dados melhores, essa análise ganha. */
async function seedProfile(appUserId: string): Promise<boolean> {
  const db = supabaseService();

  const { data: existing } = await db
    .from('creator_profile')
    .select('id, coverage, updated_at, source')
    .eq('app_user_id', appUserId)
    .maybeSingle();

  const jaEObservado =
    existing?.coverage === 'observed' &&
    existing.source === AUDIT_PROVENANCE;

  if (jaEObservado) return false;

  const { error } = await db.from('creator_profile').upsert(
    {
      app_user_id: appUserId,
      handle: OBSERVED_PROFILE.handle,
      dimensions: asJson(OBSERVED_PROFILE.dimensions),
      topics: asJson(OBSERVED_PROFILE.topics),
      successful_formats: asJson(OBSERVED_PROFILE.successfulFormats),
      avoided_formats: asJson(OBSERVED_PROFILE.avoidedFormats),
      evidence: asJson(OBSERVED_PROFILE.evidence),
      coverage: OBSERVED_PROFILE.coverage,
      sample_size: OBSERVED_PROFILE.sampleSize,
      source: AUDIT_PROVENANCE,
      strategy_version: STRATEGY_VERSION,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'app_user_id' },
  );

  return !error;
}

/** A auditoria como fonte, com a autoridade dita por inteiro.
 *
 *  `authority` alta é sobre identidade e conteúdo observado. Sobre métricas é
 *  nenhuma — o Instagram bloqueou o feed autenticado e nada foi medido — e essa
 *  distinção fica no título, que é onde alguém a lê antes de citar um número
 *  que não existe. */
async function seedKnowledgeSource(): Promise<boolean> {
  const db = supabaseService();
  const { error } = await db.from('knowledge_source').upsert(
    {
      source_type: 'instagram',
      title: `${STRATEGY_SOURCE.name} — identidade observada, métricas não verificadas`,
      authority: 85,
      version: STRATEGY_VERSION,
      effective_date: STRATEGY_SOURCE.observedAt,
      status: 'active',
    },
    { onConflict: 'source_type,title,version', ignoreDuplicates: true },
  );
  return !error;
}

/** As trinta ideias, como semente.
 *
 *  Entram com `status = 'seed'`: não aparecem no Hoje, não contam para a carga
 *  do dia, e não viram tarefa. São o ponto de partida de que o planeador se
 *  serve quando um pilar está em falta — e são a prova de que a auditoria não
 *  ficou num PDF. */
async function seedIdeas(appUserId: string): Promise<number> {
  const db = supabaseService();

  // A idempotência não pode ser só a contagem.
  //
  // Era: «se já há trinta, não faças nada». Uma correção ao texto de uma
  // semente ficava só no código, e a base continuava a servir ao planeador a
  // versão velha — foi assim que «Passei anos a anotar isto» sobreviveu à
  // reescrita e voltou a sair num plano. A âncora passa a ser a impressão
  // digital: o que está na base e já não está no código é substituído.
  //
  // Uma semente que ela já promoveu a ideia não se toca: mudou de estado, é
  // uma decisão dela e deixou de ser matéria-prima.
  const impressao = (s: (typeof SEED_IDEAS)[number]) =>
    ideaFingerprint({ platform: 'seed', pillar: s.pillar, hook: s.hook, title: s.title });

  const esperadas = new Set(SEED_IDEAS.map(impressao));

  const { data: existentes } = await db
    .from('creator_content_idea')
    .select('id, fingerprint, status')
    .eq('provenance', AUDIT_PROVENANCE);

  const naBase = new Set((existentes ?? []).map((r) => r.fingerprint));
  const velhas = (existentes ?? []).filter(
    (r) => r.status === 'seed' && !esperadas.has(r.fingerprint),
  );

  if (velhas.length) {
    await db
      .from('creator_content_idea')
      .delete()
      .in('id', velhas.map((r) => r.id));
  }

  const emFalta = SEED_IDEAS.filter((s) => !naBase.has(impressao(s)));
  if (emFalta.length === 0) return 0;

  const hoje = new Date().toISOString().slice(0, 10);
  const rows = emFalta.map((s) => ({
    app_user_id: appUserId,
    plan_date: hoje,
    // As sementes não têm plataforma decidida: quem decide isso é o plano do
    // dia, que sabe o que cada uma pede. Instagram é o de maior alcance para
    // os pilares dela e serve de arrumação.
    platform: 'instagram' as const,
    status: 'seed' as const,
    pillar: s.pillar,
    title: s.title,
    hook: s.hook,
    duration_seconds: s.seconds,
    source_reason: 'Ideia da auditoria do Instagram. Ainda não é um plano — é matéria-prima.',
    provenance: AUDIT_PROVENANCE,
    strategy_version: STRATEGY_VERSION,
    fingerprint: impressao(s),
    generated_at: new Date().toISOString(),
  }));

  const { data, error } = await db.from('creator_content_idea').insert(rows).select('id');
  return error ? 0 : (data ?? []).length;
}

/** As sementes de um pilar, para o planeador se servir delas.
 *
 *  Devolve o que ainda não foi usado. Uma semente que já virou vídeo não volta
 *  a ser proposta como se fosse nova. */
export async function seedsForPillar(pillar: string, limit = 4): Promise<{ title: string; hook: string }[]> {
  const db = supabaseService();
  const { data } = await db
    .from('creator_content_idea')
    .select('title, hook')
    .eq('status', 'seed')
    .eq('pillar', pillar)
    .limit(limit);

  return (data ?? []).map((r) => ({ title: r.title, hook: r.hook }));
}
