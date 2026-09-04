/** O que estamos aprendendo, e quem manda quando as fontes discordam.
 *
 *  Três fontes falam sobre o conteúdo dela: a mentoria, a auditoria do perfil
 *  e os números reais. Não dizem sempre o mesmo, e esconder a diferença é como
 *  um sistema começa a recomendar coisas que ninguém consegue explicar.
 *
 *  A ordem é fixa e está escrita: uma decisão explícita dela ganha a tudo; um
 *  número verificado ganha a uma opinião; a auditoria (que viu o perfil) ganha
 *  à mentoria (que não viu); a mentoria ganha à inferência.
 *
 *  Os aprendizados nascem dos números, com tamanho de amostra e confiança à
 *  vista. Com três peças não se conclui nada; diz-se que são três.
 *
 *  Puro. */

import { EXPERIMENT_SPEC, type ExperimentKind, type KnowledgeKind } from './mentor-playbook';

/* ── Precedência ──────────────────────────────────────────────────────────── */

export const PRECEDENCE = [
  'EXPLICIT_CAROL_DECISION',
  'VERIFIED_PERFORMANCE',
  'LATEST_PROFILE_AUDIT',
  'MENTOR_PLAYBOOK',
  'GENERIC_INFERENCE',
] as const;
export type Precedence = (typeof PRECEDENCE)[number];

export const PRECEDENCE_LABEL: Record<Precedence, string> = {
  EXPLICIT_CAROL_DECISION: 'decisão dela',
  VERIFIED_PERFORMANCE: 'números reais',
  LATEST_PROFILE_AUDIT: 'auditoria do perfil',
  MENTOR_PLAYBOOK: 'mentoria',
  GENERIC_INFERENCE: 'inferência',
};

export type Signal = {
  source: Precedence;
  claim: string;
  sampleSize?: number;
  confidence?: 'low' | 'medium' | 'high';
};

/** Um número com três peças não é «verificado». Desce para inferência até
 *  ter amostra. */
export function effectivePrecedence(s: Signal): Precedence {
  if (s.source === 'VERIFIED_PERFORMANCE' && ((s.sampleSize ?? 0) < 3 || s.confidence === 'low')) {
    return 'GENERIC_INFERENCE';
  }
  return s.source;
}

export function resolveStrategy(signals: readonly Signal[]): { winner: Signal | null; because: string; trace: { signal: Signal; rank: Precedence }[] } {
  const trace = signals.map((signal) => ({ signal, rank: effectivePrecedence(signal) }));
  trace.sort((a, b) => PRECEDENCE.indexOf(a.rank) - PRECEDENCE.indexOf(b.rank));
  const winner = trace[0]?.signal ?? null;
  return {
    winner,
    because: winner
      ? `Vale «${winner.claim}» (${PRECEDENCE_LABEL[trace[0].rank]})${trace.length > 1 ? `; ficam registadas ${trace.length - 1} outras leituras` : ''}.`
      : 'Sem sinais.',
    trace,
  };
}

/** Os conflitos que já se conhecem, resolvidos por escrito. */
export const KNOWN_CONFLICTS: readonly {
  id: string;
  topic: string;
  mentor: string;
  audit: string;
  resolution: string;
  decidedBy: Precedence;
}[] = [
  {
    id: 'education',
    topic: 'Conteúdo educativo',
    mentor: 'Tutoriais de gravação, luz, edição e CapCut geram saves e atraem marcas.',
    audit: 'Virar professora atrai creators e afasta as marcas que pagam.',
    resolution: 'Educar como prova de ofício: a decisão real num vídeo real, bruto → ajuste → final. Nunca «5 dicas».',
    decidedBy: 'LATEST_PROFILE_AUDIT',
  },
  {
    id: 'tech',
    topic: 'Tecnologia',
    mentor: 'Foco no nicho de tecnologia para o lar.',
    audit: 'O diferencial do perfil são as histórias pessoais e a hospitalidade.',
    resolution: 'Tech manda na prospecção comercial; o conteúdo orgânico é a identidade dela, e tech entra quando é episódio da vida.',
    decidedBy: 'EXPLICIT_CAROL_DECISION',
  },
  {
    id: 'skincare',
    topic: 'Skincare',
    mentor: 'Skincare arquivado por falta de identificação.',
    audit: 'Pele real (rosácea) é dos conteúdos mais naturais dela.',
    resolution: 'Skincare fora como nicho comercial, como já está em código. A rosácea continua como história pessoal, não como rotina de beleza.',
    decidedBy: 'EXPLICIT_CAROL_DECISION',
  },
  {
    id: 'frequency',
    topic: 'Frequência de Reels Test',
    mentor: 'Três a cinco por dia.',
    audit: 'Doze a dezasseis peças em trinta dias, três a quatro por semana.',
    resolution: 'Um teste por dia por omissão, com B-roll que já existe. O modo intensivo sobe para três a cinco quando ela quiser — e a capacidade real do dia manda.',
    decidedBy: 'MENTOR_PLAYBOOK',
  },
  {
    id: 'english',
    topic: 'Conteúdo em inglês',
    mentor: 'Produzir conteúdo em inglês para marcas internacionais.',
    audit: 'Inglês de stock na tela piora a identificação em Portugal.',
    resolution: 'Inglês como experiência medida — uma peça por semana, falada e com guião — nunca inglês decorativo na tela.',
    decidedBy: 'MENTOR_PLAYBOOK',
  },
  {
    id: 'aesthetic',
    topic: 'Maquiagem e moda',
    mentor: 'Testar conteúdo estético de maquiagem e estilo.',
    audit: 'GRWM de maquiagem é formato fraco; possível, sem tese.',
    resolution: 'Território orgânico experimental, em poucas peças. Não vira prioridade comercial sozinho.',
    decidedBy: 'MENTOR_PLAYBOOK',
  },
];

/* ── Aprendizados ─────────────────────────────────────────────────────────── */

export type PerfRow = {
  ideaId: string;
  format: string;
  track: string | null;
  language: string | null;
  contentFunction: string | null;
  views: number | null;
  reach?: number | null;
  nonFollowerReach?: number | null;
  comments?: number | null;
  saves?: number | null;
  shares?: number | null;
  profileVisits?: number | null;
};

export type ContentLearning = {
  statement: string;
  evidence: { dimension: string; metric: string; a: { label: string; n: number; value: number }; b: { label: string; n: number; value: number } };
  sampleSize: number;
  confidence: 'low' | 'medium' | 'high';
  kind: KnowledgeKind;
};

type Metric = { key: string; label: string; of: (r: PerfRow) => number | null };

const perThousand = (num: number | null | undefined, views: number | null) =>
  typeof num === 'number' && views && views > 0 ? (num / views) * 1000 : null;

const METRICS: Metric[] = [
  { key: 'comments', label: 'comentários', of: (r) => perThousand(r.comments, r.views) },
  { key: 'saves', label: 'saves', of: (r) => perThousand(r.saves, r.views) },
  { key: 'shares', label: 'partilhas', of: (r) => perThousand(r.shares, r.views) },
  { key: 'nonFollowers', label: 'alcance de não seguidores', of: (r) => (r.reach && r.reach > 0 && typeof r.nonFollowerReach === 'number' ? r.nonFollowerReach / r.reach : null) },
  { key: 'profileVisits', label: 'visitas ao perfil', of: (r) => perThousand(r.profileVisits, r.views) },
];

type Dimension = { key: string; label: (r: PerfRow) => string | null };

const formatClass = (f: string) => {
  const t = f.toLowerCase();
  if (/talking ?head|falad|rosto/.test(t)) return 'talking head';
  if (/b-?roll|montagem|voice ?over/.test(t)) return 'B-roll';
  return null;
};

const DIMENSIONS: Dimension[] = [
  { key: 'format', label: (r) => formatClass(r.format) },
  { key: 'language', label: (r) => (r.language ? (r.language.startsWith('en') ? 'inglês' : 'português') : null) },
  { key: 'track', label: (r) => (r.track === 'reels_test' ? 'Reels Test' : r.track ? 'feed' : null) },
  {
    key: 'function',
    label: (r) => ({ attract_connect: 'conexão', educate_retain: 'conteúdo útil', convert: 'prova para marcas' })[r.contentFunction ?? ''] ?? null,
  },
];

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const fmt = (x: number) => (x < 1 ? (Math.round(x * 100) / 100).toString().replace('.', ',') : (Math.round(x * 10) / 10).toString().replace('.', ','));

/** «Talking heads estão gerando mais comentários que B-roll.»
 *
 *  Só se afirma o que a amostra aguenta: dois grupos com pelo menos três
 *  peças cada, e uma diferença de 1,5× ou mais. Devolve no máximo três. */
export function deriveLearnings(rows: readonly PerfRow[], opts: { minPerGroup?: number; max?: number } = {}): ContentLearning[] {
  const minN = opts.minPerGroup ?? 3;
  const out: (ContentLearning & { strength: number })[] = [];

  for (const dim of DIMENSIONS) {
    const groups = new Map<string, PerfRow[]>();
    for (const r of rows) {
      const g = dim.label(r);
      if (!g) continue;
      groups.set(g, [...(groups.get(g) ?? []), r]);
    }
    const labels = [...groups.keys()].filter((g) => groups.get(g)!.length >= minN);
    if (labels.length < 2) continue;

    for (const metric of METRICS) {
      const stats = labels
        .map((label) => {
          const vals = groups.get(label)!.map(metric.of).filter((v): v is number => typeof v === 'number');
          return vals.length >= minN ? { label, n: vals.length, value: mean(vals) } : null;
        })
        .filter((s): s is { label: string; n: number; value: number } => Boolean(s))
        .sort((a, b) => b.value - a.value);
      if (stats.length < 2) continue;
      const [a, b] = stats;
      if (b.value <= 0 || a.value / b.value < 1.5) continue;

      const n = a.n + b.n;
      const minSide = Math.min(a.n, b.n);
      out.push({
        statement: `${a.label.charAt(0).toUpperCase() + a.label.slice(1)} está gerando mais ${metric.label} que ${b.label} (${fmt(a.value)} vs ${fmt(b.value)}${metric.key === 'nonFollowers' ? ' de alcance' : ' por mil views'} · ${a.n} e ${b.n} peças).`,
        evidence: { dimension: dim.key, metric: metric.key, a, b },
        sampleSize: n,
        confidence: minSide < 5 ? 'low' : minSide < 10 ? 'medium' : 'high',
        kind: 'OBSERVED_CAROL_SIGNAL',
        strength: a.value / b.value,
      });
    }
  }

  return out
    .sort((a, b) => b.strength - a.strength)
    .slice(0, opts.max ?? 3)
    .map(({ strength: _s, ...l }) => l);
}

/* ── Experiências ─────────────────────────────────────────────────────────── */

export type Experiment = {
  kind: ExperimentKind | string;
  hypothesis: string;
  whatWeTest: string;
  result: string | null;
  learning: string | null;
  repeat: string | null;
  sampleSize: number;
};

/** Sem A/B académico. Cinco linhas que qualquer pessoa lê. */
export function experimentSummary(e: Experiment): string {
  const spec = EXPERIMENT_SPEC[e.kind as ExperimentKind];
  return [
    `HIPÓTESE: ${e.hypothesis || spec?.hypothesis || '—'}`,
    `O QUE TESTAMOS: ${e.whatWeTest || spec?.whatWeTest || '—'}`,
    `RESULTADO: ${e.result ?? (e.sampleSize ? `${e.sampleSize} peças medidas, ainda sem conclusão` : 'ainda sem peças medidas')}`,
    `O QUE APRENDEMOS: ${e.learning ?? '—'}`,
    `O QUE REPETIR: ${e.repeat ?? '—'}`,
  ].join('\n');
}

/** O ciclo: ideia → teste → medição → aprendizado → iteração → candidata a feed. */
export const TEST_LIFECYCLE = ['idea', 'test', 'measure', 'learning', 'iteration', 'feed_candidate'] as const;
export type LifecycleStage = (typeof TEST_LIFECYCLE)[number];

export function lifecycleStage(input: { status: string; track: string | null; measurements: number; hasLearning: boolean; promotionCandidate: boolean; variantOf: boolean }): LifecycleStage {
  if (input.promotionCandidate) return 'feed_candidate';
  if (input.variantOf) return 'iteration';
  if (input.hasLearning) return 'learning';
  if (input.measurements > 0) return 'measure';
  if (input.track === 'reels_test' && (input.status === 'published' || input.status === 'recorded')) return 'test';
  return 'idea';
}
