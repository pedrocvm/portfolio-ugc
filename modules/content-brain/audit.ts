/** A Auditoria: o que mudou, o que aprendemos, o que testar agora.
 *
 *  Esta camada não mede nada. Recebe o que já foi medido — o resumo do Feed, a
 *  leitura das sequências de Stories, a escada de aprendizado, o veredito dos
 *  testes e o histórico diário da conta — e transforma isso em três a seis
 *  conclusões que mudam uma decisão.
 *
 *  Quatro regras que este módulo existe para não deixar quebrar:
 *
 *  1. **Não se fabrica conclusão.** Sem amostra, a saída é vazia e a tela diz
 *     que ainda não há histórico. Um espaço em branco honesto vale mais do que
 *     seis frases genéricas.
 *  2. **Toda a conclusão carrega a prova.** `evidence`, `sampleSize`,
 *     `comparator` e `engineVersion` viajam com a frase. Uma frase que não
 *     consiga apontar para as peças que a sustentam não sai daqui.
 *  3. **Recomendação genérica é recusada em código.** «Poste mais», «capriche
 *     no gancho», «seja consistente» — qualquer conselho que servisse a outra
 *     creator sem olhar para os números dela é rejeitado por `genericAdvice`,
 *     com teste.
 *  4. **Uma recomendação envelhece.** Quando a evidência que a gerou muda de
 *     degrau ou desaparece, ela passa a `superseded` — nunca fica aberta para
 *     sempre a pedir uma coisa que os dados já não pedem.
 *
 *  Puro. Sem rede, sem base, sem IA. */

import type { LadderState } from './learning';

export const AUDIT_ENGINE_VERSION = 'CAROL_AUDIT_ENGINE_V1';

/* ── Períodos ─────────────────────────────────────────────────────────────── */

export const AUDIT_PERIODS = ['7d', '30d', '90d', 'all', 'custom'] as const;
export type AuditPeriod = (typeof AUDIT_PERIODS)[number];

export const isAuditPeriod = (v: unknown): v is AuditPeriod =>
  typeof v === 'string' && (AUDIT_PERIODS as readonly string[]).includes(v);

export const PERIOD_LABEL: Record<AuditPeriod, string> = {
  '7d': '7 dias',
  '30d': '30 dias',
  '90d': '90 dias',
  all: 'Todo o histórico',
  custom: 'Período escolhido',
};

const DAY = 86_400_000;

export type PeriodRange = {
  period: AuditPeriod;
  /** Início inclusivo, em ISO UTC. `null` em «todo o histórico». */
  from: string | null;
  /** Fim exclusivo, em ISO UTC. */
  to: string;
  /** A janela imediatamente anterior, do mesmo tamanho. `null` quando não
   *  existe janela anterior comparável — e nesse caso não se diz «piorou». */
  previous: { from: string; to: string } | null;
  label: string;
};

/** A janela e a janela anterior do mesmo tamanho.
 *
 *  Persistência é UTC; o recorte também. Converter para o fuso da usuária
 *  antes de subtrair dias é como se perde um dia inteiro duas vezes por ano. */
export function periodRange(
  period: AuditPeriod,
  opts: { now?: Date; from?: string | null; to?: string | null } = {},
): PeriodRange {
  const agora = opts.now ?? new Date();
  const to = opts.to ? new Date(opts.to) : agora;
  const toIso = to.toISOString();

  if (period === 'all') {
    return { period, from: null, to: toIso, previous: null, label: PERIOD_LABEL.all };
  }

  if (period === 'custom') {
    const from = opts.from ? new Date(opts.from) : new Date(to.getTime() - 30 * DAY);
    const span = Math.max(to.getTime() - from.getTime(), DAY);
    return {
      period,
      from: from.toISOString(),
      to: toIso,
      previous: { from: new Date(from.getTime() - span).toISOString(), to: from.toISOString() },
      label: PERIOD_LABEL.custom,
    };
  }

  const dias = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const from = new Date(to.getTime() - dias * DAY);
  return {
    period,
    from: from.toISOString(),
    to: toIso,
    previous: { from: new Date(from.getTime() - dias * DAY).toISOString(), to: from.toISOString() },
    label: PERIOD_LABEL[period],
  };
}

/* ── Evolução da conta ────────────────────────────────────────────────────── */

export type AccountDay = {
  observedOn: string;
  followersCount: number | null;
  reach: number | null;
  views: number | null;
  accountsEngaged: number | null;
  totalInteractions: number | null;
  profileLinkTaps: number | null;
};

export type AccountPoint = AccountDay & {
  /** Crescimento líquido derivado do próprio histórico, nunca de uma métrica
   *  única da Meta: `followers_count` de hoje menos o do dia medido anterior.
   *  `null` no primeiro ponto e sempre que falta um dos dois lados. */
  followersDelta: number | null;
};

/** Série diária com o delta derivado.
 *
 *  O delta salta buracos de propósito: se a captura falhou três dias, o
 *  próximo ponto compara com o último dia **medido** e diz-o em `spanDays`.
 *  Dividir por três para «estimar» seria inventar medição. */
export function accountSeries(days: readonly AccountDay[]): AccountPoint[] {
  const ordenados = [...days]
    .filter((d) => Number.isFinite(Date.parse(d.observedOn)))
    .sort((a, b) => Date.parse(a.observedOn) - Date.parse(b.observedOn));

  let anterior: number | null = null;
  return ordenados.map((d) => {
    const delta = d.followersCount !== null && anterior !== null ? d.followersCount - anterior : null;
    if (d.followersCount !== null) anterior = d.followersCount;
    return { ...d, followersDelta: delta };
  });
}

export type AccountMovement = {
  metric: string;
  label: string;
  current: number | null;
  previous: number | null;
  /** Variação relativa. `null` quando falta um dos lados ou o anterior é zero. */
  change: number | null;
  direction: 'up' | 'down' | 'flat' | 'unknown';
  /** Dias com medição de cada lado. Uma janela com dois dias medidos não
   *  compara com uma de trinta. */
  sample: { current: number; previous: number };
};

/** A etiqueta traz o artigo: «as contas alcançadas», «os seguidores ganhos».
 *  Sem isto o molde escrevia «As seguidores ganhos caíram». */
const ACCOUNT_METRIC_LABEL: Record<string, string> = {
  reach: 'as contas alcançadas',
  views: 'as visualizações',
  accountsEngaged: 'as contas que interagiram',
  totalInteractions: 'as interações',
  profileLinkTaps: 'os cliques no link',
  followersDelta: 'os seguidores ganhos',
};

/** Abaixo disto, dizer «subiu» ou «desceu» é ruído. */
export const MATERIAL_CHANGE = 0.15;
/** Conteúdos mínimos para uma conclusão poder chamar-se aprendizado. Uma
 *  publicação só é uma ocorrência, nunca uma lição. */
export const MIN_EVIDENCE_FOR_LEARNED = 2;
/** Dias medidos mínimos de cada lado para comparar duas janelas. */
export const MIN_DAYS_PER_WINDOW = 3;

const soma = (xs: (number | null)[]): { total: number | null; n: number } => {
  const v = xs.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  return { total: v.length ? v.reduce((a, b) => a + b, 0) : null, n: v.length };
};

/** Compara duas janelas da conta, métrica a métrica.
 *
 *  Um lado sem dias medidos suficientes devolve `unknown` — não `flat`. A
 *  diferença importa: «não sei» não pode virar «não mudou». */
export function compareAccountWindows(
  current: readonly AccountPoint[],
  previous: readonly AccountPoint[],
  opts: { minDays?: number } = {},
): AccountMovement[] {
  const min = opts.minDays ?? MIN_DAYS_PER_WINDOW;
  const metricas: (keyof AccountPoint)[] = ['reach', 'views', 'accountsEngaged', 'totalInteractions', 'profileLinkTaps', 'followersDelta'];

  return metricas.map((m) => {
    const a = soma(current.map((d) => d[m] as number | null));
    const b = soma(previous.map((d) => d[m] as number | null));
    const comparavel = a.n >= min && b.n >= min && a.total !== null && b.total !== null;
    const change = comparavel && b.total !== 0 ? (a.total! - b.total!) / Math.abs(b.total!) : null;

    return {
      metric: m as string,
      label: ACCOUNT_METRIC_LABEL[m as string] ?? (m as string),
      current: a.total,
      previous: b.total,
      change,
      direction: !comparavel || change === null
        ? 'unknown'
        : change >= MATERIAL_CHANGE
          ? 'up'
          : change <= -MATERIAL_CHANGE
            ? 'down'
            : 'flat',
      sample: { current: a.n, previous: b.n },
    } satisfies AccountMovement;
  });
}

/* ── Conclusões ───────────────────────────────────────────────────────────── */

export const AUDIT_BUCKETS = ['improved', 'worsened', 'learned', 'attention', 'test'] as const;
export type AuditBucket = (typeof AUDIT_BUCKETS)[number];

export const BUCKET_LABEL: Record<AuditBucket, string> = {
  improved: 'O que melhorou',
  worsened: 'O que piorou',
  learned: 'O que aprendemos',
  attention: 'O que merece atenção',
  test: 'O que testar agora',
};

export type Evidence = {
  mediaIds: string[];
  learningIds: string[];
  experimentIds: string[];
  sequenceIds: string[];
};

export const emptyEvidence = (): Evidence => ({ mediaIds: [], learningIds: [], experimentIds: [], sequenceIds: [] });

/** Há alguma coisa para onde apontar? */
export const hasEvidence = (e: Evidence): boolean =>
  e.mediaIds.length > 0 || e.learningIds.length > 0 || e.experimentIds.length > 0 || e.sequenceIds.length > 0;

export type AuditConclusion = {
  /** Estável entre corridas: a mesma conclusão sobre a mesma coisa tem a mesma
   *  chave, e é por isso que uma auditoria consegue dizer «isto é novo». */
  key: string;
  bucket: AuditBucket;
  text: string;
  /** «Baseado em 3 conteúdos», «7 dos últimos 9 Reels». Sai literalmente. */
  sample: string;
  sampleSize: number;
  confidence: 'low' | 'medium' | 'high';
  /** A métrica interna que sustenta a frase, quando há uma. */
  metric: string | null;
  /** Com o que se comparou: mediana da coorte, janela anterior, outro braço. */
  comparator: string;
  evidence: Evidence;
  engineVersion: string;
};

/** Um ponto do resumo do Feed, tal como `feedSummary` o devolve. */
export type FeedPoint = { text: string; sample: string; confidence: 'low' | 'medium' | 'high'; evidence: string[] };

export type StoryPoint = { text: string; sample: string; confidence: 'low' | 'medium'; sequenceIds?: readonly string[] };

export type LearningInput = {
  id: string;
  statement: string;
  ladderState: LadderState;
  sampleSize: number;
  confidence: 'low' | 'medium' | 'high';
  evidenceIds: readonly string[];
  derivedAt: string;
  /** Quando o degrau desceu ou a peça deixou de se repetir. */
  contradictedAt?: string | null;
};

export type ExperimentInput = {
  id: string;
  label: string;
  outcome: 'pending' | 'inconclusive' | 'favourable' | 'contrary' | 'consistent';
  because: string;
  sampleSize: number;
  primaryMetric: string | null;
  mediaIds: readonly string[];
};

export type AuditInput = {
  range: PeriodRange;
  account: { current: readonly AccountPoint[]; previous: readonly AccountPoint[] };
  feed: { points: readonly FeedPoint[]; comparable: number; total: number };
  stories: { points: readonly StoryPoint[]; measuredSequences: number };
  learnings: readonly LearningInput[];
  experiments: readonly ExperimentInput[];
  now?: Date;
};

export type AuditResult = {
  conclusions: AuditConclusion[];
  /** A única ação principal. `null` quando nada merece virar teste hoje. */
  nextTest: RecommendationDraft | null;
  recommendations: RecommendationDraft[];
  /** Porque é que há tão pouco (ou nada). Sai na tela quando `conclusions`
   *  fica curto — é a diferença entre um vazio confuso e um vazio honesto. */
  coverage: string;
  engineVersion: string;
  generatedAt: string;
};

const CONF_ORDER = { low: 0, medium: 1, high: 2 } as const;

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Chave estável a partir de um texto. Sem aleatoriedade: a mesma conclusão
 *  numa corrida amanhã tem de dar a mesma chave, ou tudo parece novo. */
export function conclusionKey(bucket: AuditBucket, seed: string): string {
  const base = seed
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 72);
  return `${bucket}:${base}`;
}

/** Monta a auditoria.
 *
 *  A ordem dos baldes é deliberada: primeiro o que mudou (melhorou, piorou),
 *  depois o que se aprendeu, depois o que merece atenção. «O que testar agora»
 *  vive à parte, em `nextTest`, porque é a única coisa que pede ação. */
export function buildAudit(input: AuditInput): AuditResult {
  const agora = input.now ?? new Date();
  const conclusoes: AuditConclusion[] = [];
  const base = { engineVersion: AUDIT_ENGINE_VERSION };

  // 1. Movimento da conta, só onde a comparação é legítima.
  const movimentos = compareAccountWindows(input.account.current, input.account.previous);
  for (const m of movimentos) {
    if (m.direction !== 'up' && m.direction !== 'down') continue;
    if (m.current === null || m.previous === null || m.change === null) continue;
    const pct = Math.round(Math.abs(m.change) * 100);
    conclusoes.push({
      ...base,
      key: conclusionKey(m.direction === 'up' ? 'improved' : 'worsened', `conta-${m.metric}`),
      bucket: m.direction === 'up' ? 'improved' : 'worsened',
      text: `${capitalize(m.label)} ${m.direction === 'up' ? 'subiram' : 'caíram'} ${pct}% em relação aos ${input.range.label.toLowerCase()} anteriores.`,
      sample: `${m.sample.current} dias medidos contra ${m.sample.previous}`,
      sampleSize: m.sample.current,
      confidence: m.sample.current >= 14 && m.sample.previous >= 14 ? 'medium' : 'low',
      metric: m.metric,
      comparator: 'janela anterior do mesmo tamanho',
      evidence: emptyEvidence(),
    });
  }

  // 2. O que o Feed ensina. `feedSummary` já recusa grupos pequenos; aqui só
  //    se descartam os pontos que dizem «ainda não sei» — esses vão para a
  //    cobertura, não para a lista de conclusões.
  //
  //    Uma peça sozinha nunca é «o que aprendemos». Por mais forte que tenha
  //    sido, é uma ocorrência: vai para «merece atenção», que é o que ela é.
  //    Chamar-lhe aprendizado é o erro que a escada inteira existe para
  //    impedir — e ele entra por aqui, não pela escada.
  for (const p of input.feed.points) {
    if (!p.evidence.length) continue;
    const bucket: AuditBucket = p.evidence.length >= MIN_EVIDENCE_FOR_LEARNED ? 'learned' : 'attention';
    conclusoes.push({
      ...base,
      key: conclusionKey(bucket, p.text),
      bucket,
      text: p.text,
      sample: `Baseado em ${p.evidence.length} ${p.evidence.length === 1 ? 'conteúdo' : 'conteúdos'}`,
      sampleSize: p.evidence.length,
      confidence: p.confidence,
      metric: null,
      comparator: 'mediana dela na mesma coorte',
      evidence: { ...emptyEvidence(), mediaIds: [...p.evidence] },
    });
  }

  // 3. Stories. A retenção de sequência é o que eles ensinam de próprio.
  for (const p of input.stories.points) {
    conclusoes.push({
      ...base,
      key: conclusionKey('learned', p.text),
      bucket: 'learned',
      text: p.text,
      sample: p.sample,
      sampleSize: input.stories.measuredSequences,
      confidence: p.confidence,
      metric: 'reachRetentionProxy',
      comparator: 'outras sequências dela',
      evidence: { ...emptyEvidence(), sequenceIds: [...(p.sequenceIds ?? [])] },
    });
  }

  // 4. A escada. Validado e rejeitado mudam decisão; sinal e hipótese pedem
  //    teste e por isso viram recomendação, não conclusão.
  for (const l of input.learnings) {
    if (l.ladderState === 'validated') {
      // A política da escada já exige três peças para validar. A auditoria não
      // confia nisso: a regra é dela e aplica-se aqui também, porque um
      // aprendizado escrito por outra versão da política continuaria a passar.
      const bucket: AuditBucket = l.sampleSize >= MIN_EVIDENCE_FOR_LEARNED ? 'learned' : 'attention';
      conclusoes.push({
        ...base,
        key: conclusionKey(bucket, `aprendizado-${l.id}`),
        bucket,
        text: l.statement,
        sample: `Baseado em ${l.sampleSize} ${l.sampleSize === 1 ? 'conteúdo' : 'conteúdos'}`,
        sampleSize: l.sampleSize,
        confidence: l.confidence,
        metric: null,
        comparator: 'mediana dela na mesma coorte',
        evidence: { ...emptyEvidence(), learningIds: [l.id], mediaIds: [...l.evidenceIds] },
      });
    }
    if (l.ladderState === 'rejected' && l.contradictedAt) {
      conclusoes.push({
        ...base,
        key: conclusionKey('attention', `contradito-${l.id}`),
        bucket: 'attention',
        text: `${l.statement} Deixei de tratar isso como padrão.`,
        sample: `Baseado em ${l.sampleSize} ${l.sampleSize === 1 ? 'conteúdo' : 'conteúdos'}`,
        sampleSize: l.sampleSize,
        confidence: l.confidence,
        metric: null,
        comparator: 'as mesmas peças que o sustentavam',
        evidence: { ...emptyEvidence(), learningIds: [l.id], mediaIds: [...l.evidenceIds] },
      });
    }
  }

  // 5. Testes com resultado.
  for (const e of input.experiments) {
    if (e.outcome === 'pending') continue;
    const bucket: AuditBucket = e.outcome === 'contrary' ? 'attention' : e.outcome === 'inconclusive' ? 'attention' : 'learned';
    conclusoes.push({
      ...base,
      key: conclusionKey(bucket, `teste-${e.id}`),
      bucket,
      text: `${e.label}: ${e.because}`,
      sample: `Baseado em ${e.sampleSize} ${e.sampleSize === 1 ? 'conteúdo' : 'conteúdos'}`,
      sampleSize: e.sampleSize,
      confidence: e.outcome === 'consistent' ? 'medium' : 'low',
      metric: e.primaryMetric,
      comparator: 'o outro braço do teste',
      evidence: { ...emptyEvidence(), experimentIds: [e.id], mediaIds: [...e.mediaIds] },
    });
  }

  const ordenadas = rankConclusions(conclusoes);
  const recomendacoes = draftRecommendations(input);

  return {
    conclusions: ordenadas,
    nextTest: recomendacoes[0] ?? null,
    recommendations: recomendacoes,
    coverage: coverageLine(input, ordenadas.length),
    engineVersion: AUDIT_ENGINE_VERSION,
    generatedAt: agora.toISOString(),
  };
}

/** Três a seis, pela ordem que decide alguma coisa.
 *
 *  Amostra grande ganha a amostra pequena, e confiança ganha o resto. Nunca se
 *  completa até seis com o que sobrou: se só há duas conclusões verdadeiras,
 *  saem duas. */
export function rankConclusions(all: readonly AuditConclusion[], max = 6): AuditConclusion[] {
  const peso: Record<AuditBucket, number> = { worsened: 0, improved: 1, learned: 2, attention: 3, test: 4 };
  const vistas = new Set<string>();
  return [...all]
    .filter((c) => (vistas.has(c.key) ? false : (vistas.add(c.key), true)))
    .sort((a, b) => {
      const conf = CONF_ORDER[b.confidence] - CONF_ORDER[a.confidence];
      if (conf !== 0) return conf;
      if (b.sampleSize !== a.sampleSize) return b.sampleSize - a.sampleSize;
      return peso[a.bucket] - peso[b.bucket];
    })
    .slice(0, max);
}

function coverageLine(input: AuditInput, n: number): string {
  if (n > 0) {
    return `${input.feed.comparable} de ${input.feed.total} conteúdos têm leitura comparável neste período.`;
  }
  if (input.feed.total === 0) {
    return 'Ainda não importei nenhum conteúdo deste período. Assim que houver publicação, começo a acompanhar como ela evolui.';
  }
  if (input.feed.comparable === 0) {
    return 'Já tenho os conteúdos, mas ainda não tenho medições comparáveis entre eles. As primeiras comparações aparecem quando houver amostra suficiente.';
  }
  return `Ainda não existe histórico suficiente para comparar este comportamento: ${input.feed.comparable} de ${input.feed.total} conteúdos têm leitura comparável.`;
}

/* ── Recomendações ────────────────────────────────────────────────────────── */

export const RECOMMENDATION_KINDS = ['repeat_mechanism', 'test_variable', 'close_experiment', 'watch_signal', 'link_context'] as const;
export type RecommendationKind = (typeof RECOMMENDATION_KINDS)[number];

export const RECOMMENDATION_STATUSES = ['open', 'executed', 'dismissed', 'superseded', 'invalid'] as const;
export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number];

export const RECOMMENDATION_STATUS_LABEL: Record<RecommendationStatus, string> = {
  open: 'Em aberto',
  executed: 'Virou teste',
  dismissed: 'Salva para depois',
  superseded: 'Substituída por dados novos',
  invalid: 'Já não se aplica',
};

export type RecommendationDraft = {
  /** Idempotência: a mesma recomendação sobre a mesma evidência não duplica. */
  dedupeKey: string;
  kind: RecommendationKind;
  /** O conselho, específico e acionável. */
  statement: string;
  /** Porque é que o sistema acha isso — a frase que abre «Ver evidências». */
  because: string;
  sampleSize: number;
  confidence: 'low' | 'medium' | 'high';
  evidence: Evidence;
  /** Já preenchido para o «Criar teste» não começar numa tela vazia. */
  testDraft: TestDraft | null;
  engineVersion: string;
};

export type TestDraft = {
  hypothesis: string;
  variable: string;
  control: string;
  variant: string;
  primaryMetric: string;
  secondaryMetrics: string[];
};

/** Conselhos que qualquer creator receberia sem que ninguém olhasse os
 *  números dela. Recusados em código, não em revisão. */
const GENERIC = [
  /\bposte?\s+mais\b/i,
  /\bpublique?\s+mais\b/i,
  /\bpostar\s+(?:todo|todos)\s+os?\s+dias?\b/i,
  /\bseja\s+consistente\b/i,
  /\bfaç?a\s+reels\b/i,
  /\buse\s+(?:um\s+)?cta\b/i,
  /\bcapriche?\s+no\s+(?:gancho|hook)\b/i,
  /\bcri[ea]\s+conte[úu]do\s+de\s+valor\b/i,
  /\bengaje\s+com\s+a\s+audi[êe]ncia\b/i,
  /\bmelhore?\s+a\s+qualidade\b/i,
  /\bconte[úu]do\s+aut[êe]ntico\b/i,
];

/** Verdadeiro quando a frase é conselho de manual.
 *
 *  Existe para a camada de IA também passar por aqui: uma narrativa que
 *  degenere em «poste mais» é rejeitada antes de chegar à tela. */
export function genericAdvice(text: string): boolean {
  return GENERIC.some((re) => re.test(text));
}

/** As recomendações que os dados sustentam, por ordem de utilidade.
 *
 *  Determinística: a IA pode reescrever a frase depois, nunca decidir se a
 *  recomendação existe. Uma sem evidência rastreável não é devolvida. */
export function draftRecommendations(input: AuditInput): RecommendationDraft[] {
  const out: RecommendationDraft[] = [];
  const base = { engineVersion: AUDIT_ENGINE_VERSION };

  // Um teste com dados suficientes é a coisa mais acionável que existe.
  for (const e of input.experiments) {
    if (e.outcome === 'pending' || e.outcome === 'inconclusive') continue;
    out.push({
      ...base,
      dedupeKey: `close_experiment:${e.id}`,
      kind: 'close_experiment',
      statement: e.outcome === 'contrary'
        ? `O teste «${e.label}» apontou para o lado contrário. Vale fechar e voltar ao formato de controlo.`
        : `O teste «${e.label}» já tem dados suficientes. Vale fechar e transformar isso em decisão.`,
      because: e.because,
      sampleSize: e.sampleSize,
      confidence: e.outcome === 'consistent' ? 'medium' : 'low',
      evidence: { ...emptyEvidence(), experimentIds: [e.id], mediaIds: [...e.mediaIds] },
      testDraft: null,
    });
  }

  // Hipótese: o degrau que existe precisamente para pedir um teste.
  for (const l of input.learnings) {
    if (l.ladderState !== 'hypothesis' && l.ladderState !== 'signal') continue;
    const mecanismo = l.statement.replace(/\s+(?:Vale|Ainda|Dá)\b.*$/s, '').trim();
    out.push({
      ...base,
      dedupeKey: `test_variable:${l.id}`,
      kind: 'test_variable',
      statement: l.ladderState === 'hypothesis'
        ? `Repita esse caminho numa história diferente e veja se o efeito volta: é o que falta para deixar de ser hipótese.`
        : `Esse padrão apareceu ${l.sampleSize === 1 ? 'uma vez' : `${l.sampleSize} vezes`}. Ainda não mudaria a estratégia por causa disso — mas vale um teste dirigido.`,
      because: mecanismo,
      sampleSize: l.sampleSize,
      confidence: l.ladderState === 'hypothesis' ? 'medium' : 'low',
      evidence: { ...emptyEvidence(), learningIds: [l.id], mediaIds: [...l.evidenceIds] },
      testDraft: {
        hypothesis: mecanismo,
        variable: 'o mecanismo do conteúdo',
        control: 'o formato que costuma usar nesse pilar',
        variant: 'o mecanismo que apareceu nessas peças',
        primaryMetric: 'shares',
        secondaryMetrics: ['saves', 'reach', 'avg_watch_time_seconds'],
      },
    });
  }

  // Validado: não pede teste, pede repetição — e a repetição tem de mudar uma
  // variável, senão é só copiar o vídeo.
  for (const l of input.learnings) {
    if (l.ladderState !== 'validated') continue;
    out.push({
      ...base,
      dedupeKey: `repeat_mechanism:${l.id}`,
      kind: 'repeat_mechanism',
      statement: 'Repita esse formato mantendo o corpo e mudando só a abertura. Assim descobre se o que funciona é a forma ou o assunto.',
      because: l.statement,
      sampleSize: l.sampleSize,
      confidence: l.confidence,
      evidence: { ...emptyEvidence(), learningIds: [l.id], mediaIds: [...l.evidenceIds] },
      testDraft: {
        hypothesis: 'O que sustenta o resultado é a forma, não o assunto.',
        variable: 'os primeiros segundos',
        control: 'a abertura que essas peças usaram',
        variant: 'uma abertura mais curta, entrando direto no assunto',
        primaryMetric: 'avg_watch_time_seconds',
        secondaryMetrics: ['shares', 'reach'],
      },
    });
  }

  // Stories: retenção de sequência é o sinal que eles dão de próprio.
  for (const p of input.stories.points) {
    out.push({
      ...base,
      dedupeKey: `watch_signal:${conclusionKey('test', p.text)}`,
      kind: 'watch_signal',
      statement: 'Repita esse desenho de sequência na próxima e compare a retenção com esta.',
      because: p.text,
      sampleSize: input.stories.measuredSequences,
      confidence: p.confidence,
      evidence: { ...emptyEvidence(), sequenceIds: [...(p.sequenceIds ?? [])] },
      testDraft: null,
    });
  }

  return out
    .filter((r) => !genericAdvice(r.statement))
    // Sem prova rastreável não há recomendação. A regra é daqui, não do
    // serviço: quando vivia só lá, a tela mostrava uma recomendação que a base
    // recusava gravar, e ninguém via a diferença.
    .filter((r) => hasEvidence(r.evidence))
    .sort((a, b) => {
      const conf = CONF_ORDER[b.confidence] - CONF_ORDER[a.confidence];
      if (conf !== 0) return conf;
      return b.sampleSize - a.sampleSize;
    })
    .slice(0, 8);
}

/** Uma recomendação aberta ainda faz sentido?
 *
 *  Duas razões para deixar de fazer: a evidência que a gerou já não está viva
 *  (o aprendizado caiu, o teste fechou), ou a auditoria nova gerou a mesma
 *  recomendação com outra chave — o que significa que a evidência mudou. */
export function staleRecommendations(
  open: readonly { dedupeKey: string; evidence: Evidence }[],
  fresh: readonly RecommendationDraft[],
  live: { learningIds: ReadonlySet<string>; experimentIds: ReadonlySet<string> },
): { dedupeKey: string; status: Extract<RecommendationStatus, 'superseded' | 'invalid'>; because: string }[] {
  const chavesNovas = new Set(fresh.map((r) => r.dedupeKey));
  const out: { dedupeKey: string; status: 'superseded' | 'invalid'; because: string }[] = [];

  for (const r of open) {
    const aprendizadoMorto = r.evidence.learningIds.length > 0 && r.evidence.learningIds.every((id) => !live.learningIds.has(id));
    const testeMorto = r.evidence.experimentIds.length > 0 && r.evidence.experimentIds.every((id) => !live.experimentIds.has(id));
    if (aprendizadoMorto || testeMorto) {
      out.push({ dedupeKey: r.dedupeKey, status: 'invalid', because: 'A evidência que sustentava esta recomendação já não está ativa.' });
      continue;
    }
    if (!chavesNovas.has(r.dedupeKey)) {
      out.push({ dedupeKey: r.dedupeKey, status: 'superseded', because: 'Os dados novos deixaram de pedir isto.' });
    }
  }
  return out;
}

/* ── O que é novo desde a última auditoria ────────────────────────────────── */

export type AuditDelta = {
  fresh: AuditConclusion[];
  gone: string[];
  /** Verdadeiro quando há algo que muda uma decisão. É o único caso em que
   *  vale interromper a Carol no Hoje. */
  worthInterrupting: boolean;
};

/** Compara duas auditorias. O Hoje só recebe o que passa aqui.
 *
 *  Uma flutuação de conta não interrompe ninguém: só aprendizado novo, teste
 *  com resultado ou padrão contradito é que mudam uma decisão. */
export function auditDelta(previousKeys: readonly string[], current: AuditResult): AuditDelta {
  const antes = new Set(previousKeys);
  const agora = new Set(current.conclusions.map((c) => c.key));
  const fresh = current.conclusions.filter((c) => !antes.has(c.key));

  return {
    fresh,
    gone: [...antes].filter((k) => !agora.has(k)),
    worthInterrupting: fresh.some(
      (c) => (c.bucket === 'learned' || c.bucket === 'attention') && c.sampleSize >= 3 && c.confidence !== 'low',
    ),
  };
}
