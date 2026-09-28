/** A leitura de cada peça contra o objetivo com que foi planeada.
 *
 *  A Auditoria já dizia o que subiu e o que desceu. O que faltava era a
 *  pergunta certa: subiu no quê, e era isso que se queria? Um Reel de atrair
 *  que trouxe alcance e nenhum comentário cumpriu a função; o mesmo número num
 *  post de reter é um aviso.
 *
 *  Não existe «post vencedor» universal, e esta é a função que impede o
 *  produto de o inventar.
 *
 *  Server-only. */

import 'server-only';

import { supabaseServer } from '@/lib/supabase/server';
import { strategyClient, type StrategyClient } from '@/lib/supabase/strategy';
import { communityFor } from './community-service';
import { OBJECTIVE_LABEL, isObjective, type Objective } from './editorial';
import { OUTCOME_LABEL, readAgainstObjective, type Outcome } from './outcome';

const client = async (c?: StrategyClient): Promise<StrategyClient> =>
  c ?? strategyClient(await supabaseServer());

export type ObjectiveOutcomeRow = {
  mediaId: string;
  publishedAt: string;
  caption: string;
  permalink: string | null;
  objective: Objective;
  objectiveLabel: string;
  outcome: Outcome;
  outcomeLabel: string;
  because: string;
  signals: { label: string; relativeToMedian: number | null }[];
  missing: string[];
};

/** As colunas do snapshot que respondem aos sinais do PDF. O que a API não
 *  devolve fica de fora e aparece como «não medido» — nunca como zero. */
const SIGNAL_COLUMN: Record<string, string> = {
  reach: 'reach',
  shares: 'shares',
  follows: 'follows',
  saves: 'saves',
  profile_visits: 'profile_activity',
};

export async function objectiveOutcomes(
  opts: { db?: StrategyClient; days?: number; limit?: number } = {},
): Promise<{ rows: ObjectiveOutcomeRow[]; unclassified: number }> {
  const db = await client(opts.db);
  const desde = new Date(Date.now() - (opts.days ?? 90) * 24 * 60 * 60 * 1000).toISOString();

  const { data: medias } = await db
    .from('instagram_media')
    .select('id, published_at, caption, permalink, content_idea_id, media_product_type')
    .neq('media_product_type', 'STORY')
    .gte('published_at', desde)
    .order('published_at', { ascending: false })
    .limit(opts.limit ?? 30);

  const lista = medias ?? [];
  if (lista.length === 0) return { rows: [], unclassified: 0 };

  const ideaIds = lista.map((m) => m.content_idea_id).filter((x): x is string => Boolean(x));
  const { data: ideas } = ideaIds.length
    ? await db.from('creator_content_idea').select('id, editorial_objective').in('id', ideaIds)
    : { data: [] as { id: string; editorial_objective: string | null }[] };
  const objetivoPorIdeia = new Map((ideas ?? []).map((i) => [i.id, i.editorial_objective]));

  const { data: snaps } = await db
    .from('instagram_media_snapshot')
    .select('media_id, snapshot_kind, reach, shares, follows, saves, profile_activity')
    .in('media_id', lista.map((m) => m.id));

  // A leitura mais recente de cada peça. `latest` ganha; sem ela, a última
  // janela que existir.
  const porMidia = new Map<string, Record<string, number | null>>();
  for (const s of snaps ?? []) {
    const atual = porMidia.get(s.media_id);
    if (!atual || s.snapshot_kind === 'latest') {
      porMidia.set(s.media_id, s as unknown as Record<string, number | null>);
    }
  }

  // A mediana é dela própria. Sem amostra não há relativo, e sem relativo não
  // há veredito — que é o correto, não uma falha.
  const medianas = new Map<string, number | null>();
  for (const [sinal, coluna] of Object.entries(SIGNAL_COLUMN)) {
    const valores = [...porMidia.values()]
      .map((s) => s[coluna])
      .filter((v): v is number => typeof v === 'number')
      .sort((a, b) => a - b);
    medianas.set(sinal, valores.length >= 3 ? valores[Math.floor(valores.length / 2)] : null);
  }

  const rows: ObjectiveOutcomeRow[] = [];
  let unclassified = 0;

  for (const m of lista) {
    const objetivo = m.content_idea_id ? objetivoPorIdeia.get(m.content_idea_id) : null;
    if (!isObjective(objetivo)) {
      unclassified += 1;
      continue;
    }

    const snap = porMidia.get(m.id) ?? {};
    const signals = Object.entries(SIGNAL_COLUMN).map(([nome, coluna]) => {
      const valor = typeof snap[coluna] === 'number' ? (snap[coluna] as number) : null;
      const mediana = medianas.get(nome) ?? null;
      return {
        name: nome,
        value: valor,
        relativeToMedian: valor !== null && mediana ? valor / mediana : null,
      };
    });

    const comunidade = await communityFor(m.id, db).catch(() => null);
    const leitura = readAgainstObjective({ objective: objetivo, signals, community: comunidade });

    rows.push({
      mediaId: m.id,
      publishedAt: m.published_at,
      caption: (m.caption ?? '').slice(0, 120),
      permalink: m.permalink,
      objective: objetivo,
      objectiveLabel: OBJECTIVE_LABEL[objetivo],
      outcome: leitura.outcome,
      outcomeLabel: OUTCOME_LABEL[leitura.outcome],
      because: leitura.because,
      signals: leitura.used.map((u) => ({ label: u.label, relativeToMedian: u.relativeToMedian })),
      missing: leitura.missing,
    });
  }

  return { rows, unclassified };
}
