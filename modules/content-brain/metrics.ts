/** Métricas: ausência, unidade, coorte e mediana própria.
 *
 *  Quatro regras que este módulo existe para não deixar ninguém quebrar:
 *
 *  1. **Indisponível não é zero.** `value: null, available: false` e
 *     `value: 0, available: true` são coisas diferentes, e transformar a
 *     primeira na segunda produz médias falsas que depois viram «aprendizado».
 *     Uma publicação de 2023, anterior à conversão para conta profissional,
 *     não tem alcance — não tem alcance zero.
 *
 *  2. **Unidade antes de interpretação.** O relatório de setup formatou
 *     «5.238 ms». O valor bruto é 5238 e a unidade é a que o endpoint
 *     documenta. Guarda-se o bruto e a unidade; os segundos derivam-se depois.
 *     Um erro de 1000× aqui multiplica por mil qualquer conclusão sobre
 *     retenção.
 *
 *  3. **Comparar idades iguais.** T+6h contra fecho de 30 dias não é
 *     comparação, é o segundo a ganhar sempre.
 *
 *  4. **Mediana, não média.** Amostra pequena e distribuição assimétrica: um
 *     Reel de 13.912 views puxa a média para um número que não descreve nada.
 *
 *  Puro. */

/* ── Valor de métrica ─────────────────────────────────────────────────────── */

export type MetricUnit = 'count' | 'milliseconds' | 'seconds' | 'ratio' | 'unknown';

export type MetricValue = {
  metric: string;
  /** O que o fornecedor devolveu, sem tocar. `null` quando não devolveu. */
  valueRaw: number | null;
  unitRaw: MetricUnit;
  /** Derivado, só para métricas de tempo. Nunca substitui o bruto. */
  valueNormalizedSeconds: number | null;
  available: boolean;
  apiVersion: string;
  fetchedAt: string;
  /** Porque não está disponível, quando não está. */
  unavailableReason?: string | null;
};

/** Constrói um valor presente. `0` que o fornecedor devolveu é um zero real. */
export function presentMetric(input: {
  metric: string;
  value: number;
  unit?: MetricUnit;
  apiVersion: string;
  fetchedAt?: string;
}): MetricValue {
  const unit = input.unit ?? 'count';
  return {
    metric: input.metric,
    valueRaw: input.value,
    unitRaw: unit,
    valueNormalizedSeconds: toSeconds(input.value, unit),
    available: true,
    apiVersion: input.apiVersion,
    fetchedAt: input.fetchedAt ?? new Date().toISOString(),
    unavailableReason: null,
  };
}

export function missingMetric(input: {
  metric: string;
  reason: string;
  apiVersion: string;
  fetchedAt?: string;
}): MetricValue {
  return {
    metric: input.metric,
    valueRaw: null,
    unitRaw: 'unknown',
    valueNormalizedSeconds: null,
    available: false,
    apiVersion: input.apiVersion,
    fetchedAt: input.fetchedAt ?? new Date().toISOString(),
    unavailableReason: input.reason,
  };
}

/** Converte para segundos apenas quando a unidade é de tempo e é conhecida.
 *
 *  Devolve `null` para `unknown` de propósito. Adivinhar a unidade é o erro
 *  que a regra 2 existe para impedir; um `null` visível na tela é honesto e um
 *  número errado não é. */
export function toSeconds(value: number | null, unit: MetricUnit): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  if (unit === 'seconds') return value;
  if (unit === 'milliseconds') return value / 1000;
  return null;
}

/** O que a tela mostra. Nunca `0`, nunca `NaN`, nunca `undefined`. */
export function formatMetric(m: MetricValue | null | undefined): string {
  if (!m || !m.available || m.valueRaw === null) return 'indisponível';
  if (m.unitRaw === 'milliseconds' || m.unitRaw === 'seconds') {
    const s = m.valueNormalizedSeconds;
    if (s === null) return 'indisponível';
    if (s < 60) return `${s.toFixed(1).replace('.', ',')} s`;
    const min = Math.floor(s / 60);
    const rest = Math.round(s % 60);
    return `${min} min ${String(rest).padStart(2, '0')} s`;
  }
  return new Intl.NumberFormat('pt-BR').format(m.valueRaw);
}

/* ── Janelas de snapshot ──────────────────────────────────────────────────── */

export const SNAPSHOT_KINDS = ['t1h', 't6h', 't24h', 't72h', 't7d', 't30d'] as const;
export type SnapshotKind = (typeof SNAPSHOT_KINDS)[number];

export const isSnapshotKind = (v: unknown): v is SnapshotKind =>
  typeof v === 'string' && (SNAPSHOT_KINDS as readonly string[]).includes(v);

const MIN = 60_000;
const HOUR = 60 * MIN;

/** Alvo e tolerância de cada janela.
 *
 *  A tolerância existe porque um job de hora a hora nunca cai no segundo
 *  exato. Sem ela, o snapshot de T+1h só existia se o cron calhasse. */
export const SNAPSHOT_WINDOW: Record<SnapshotKind, { targetMs: number; toleranceMs: number; label: string }> = {
  t1h: { targetMs: 1 * HOUR, toleranceMs: 20 * MIN, label: '1 hora' },
  t6h: { targetMs: 6 * HOUR, toleranceMs: 60 * MIN, label: '6 horas' },
  t24h: { targetMs: 24 * HOUR, toleranceMs: 2 * HOUR, label: '24 horas' },
  t72h: { targetMs: 72 * HOUR, toleranceMs: 4 * HOUR, label: '72 horas' },
  t7d: { targetMs: 7 * 24 * HOUR, toleranceMs: 12 * HOUR, label: '7 dias' },
  t30d: { targetMs: 30 * 24 * HOUR, toleranceMs: 24 * HOUR, label: '30 dias' },
};

/** Que snapshots estão em janela agora e ainda não foram tirados.
 *
 *  Uma janela que já passou por completo fica por tirar para sempre — é a
 *  escolha certa: inventar um T+1h vinte horas depois seria rotular como
 *  «primeira hora» um número que não é. */
export function dueSnapshots(input: {
  publishedAt: string | Date;
  existing: readonly SnapshotKind[];
  now?: Date;
}): SnapshotKind[] {
  const publicado = new Date(input.publishedAt).getTime();
  const agora = (input.now ?? new Date()).getTime();
  if (!Number.isFinite(publicado)) return [];
  const idade = agora - publicado;
  const feitos = new Set(input.existing);

  return SNAPSHOT_KINDS.filter((kind) => {
    if (feitos.has(kind)) return false;
    const { targetMs, toleranceMs } = SNAPSHOT_WINDOW[kind];
    return idade >= targetMs - toleranceMs && idade <= targetMs + toleranceMs;
  });
}

/** A janela mais próxima da idade de um conteúdo. Serve para comparar
 *  like-for-like: só se compara T+24h com T+24h. */
export function snapshotAgeBucket(ageMs: number): SnapshotKind | null {
  for (const kind of SNAPSHOT_KINDS) {
    const { targetMs, toleranceMs } = SNAPSHOT_WINDOW[kind];
    if (ageMs >= targetMs - toleranceMs && ageMs <= targetMs + toleranceMs) return kind;
  }
  return null;
}

/* ── Baseline própria ─────────────────────────────────────────────────────── */

export type Baseline = {
  metric: string;
  n: number;
  median: number | null;
  mean: number | null;
  p25: number | null;
  p75: number | null;
  /** Falso quando a amostra é pequena de mais para dizer o que quer que seja. */
  sufficient: boolean;
  /** Explicação em português quando não é suficiente. */
  caveat: string | null;
};

/** Abaixo disto o produto diz que não sabe. Policy v1: revisível, e nunca
 *  apresentada como verdade estatística. */
export const MIN_BASELINE_SAMPLE = 5;

export function median(values: readonly number[]): number | null {
  const v = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/** Percentil por interpolação linear, que é o que dá P25 e P75 estáveis numa
 *  amostra de onze. O método do «índice inteiro» salta valores. */
export function percentile(values: readonly number[], p: number): number | null {
  const v = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  if (v.length === 1) return v[0];
  const pos = (v.length - 1) * p;
  const low = Math.floor(pos);
  const high = Math.ceil(pos);
  if (low === high) return v[low];
  return v[low] + (v[high] - v[low]) * (pos - low);
}

/** Constrói a baseline de uma métrica dentro de uma coorte.
 *
 *  Só entram valores disponíveis: um `null` do fornecedor não pode contar como
 *  zero na mediana, e essa é a diferença entre uma mediana verdadeira e uma
 *  puxada para baixo por publicações que a API nunca mediu. */
export function buildBaseline(
  metric: string,
  samples: readonly MetricValue[],
  opts: { minSample?: number } = {},
): Baseline {
  const min = opts.minSample ?? MIN_BASELINE_SAMPLE;
  const values = samples
    .filter((s) => s.available && s.valueRaw !== null)
    .map((s) => (s.unitRaw === 'milliseconds' || s.unitRaw === 'seconds' ? (s.valueNormalizedSeconds ?? Number.NaN) : (s.valueRaw as number)))
    .filter((n) => Number.isFinite(n));

  const n = values.length;
  const sufficient = n >= min;
  return {
    metric,
    n,
    median: median(values),
    mean: n ? values.reduce((a, b) => a + b, 0) / n : null,
    p25: percentile(values, 0.25),
    p75: percentile(values, 0.75),
    sufficient,
    caveat: sufficient
      ? null
      : n === 0
        ? 'Ainda não tenho nenhuma medição comparável.'
        : `Só tenho ${n} ${n === 1 ? 'peça comparável' : 'peças comparáveis'}. É pouco para dizer o que é normal.`,
  };
}

export type RelativeReading = {
  metric: string;
  value: number | null;
  median: number | null;
  /** Quantas vezes a mediana. `null` quando não dá para comparar. */
  ratio: number | null;
  /** Frase para a tela. Nunca «viralizou», nunca «morreu». */
  reading: string;
  comparable: boolean;
};

/** Leitura relativa à mediana própria.
 *
 *  Devolve sempre uma frase honesta: sem amostra diz que não sabe, e nunca
 *  usa linguagem de urgência. */
export function relativeToMedian(input: {
  metric: string;
  label?: string;
  value: MetricValue | null;
  baseline: Baseline;
}): RelativeReading {
  const nome = input.label ?? input.metric;
  const v = input.value;
  if (!v || !v.available || v.valueRaw === null) {
    return { metric: input.metric, value: null, median: input.baseline.median, ratio: null, reading: `${nome}: indisponível`, comparable: false };
  }
  const valor = v.unitRaw === 'milliseconds' || v.unitRaw === 'seconds' ? v.valueNormalizedSeconds : v.valueRaw;
  if (valor === null) {
    return { metric: input.metric, value: null, median: input.baseline.median, ratio: null, reading: `${nome}: indisponível`, comparable: false };
  }
  if (!input.baseline.sufficient || input.baseline.median === null || input.baseline.median === 0) {
    return {
      metric: input.metric,
      value: valor,
      median: input.baseline.median,
      ratio: null,
      reading: `${nome}: ${new Intl.NumberFormat('pt-BR').format(Math.round(valor))} — ${input.baseline.caveat ?? 'ainda sem comparação'}`,
      comparable: false,
    };
  }
  const ratio = valor / input.baseline.median;
  return {
    metric: input.metric,
    value: valor,
    median: input.baseline.median,
    ratio,
    reading: `${nome}: ${ratio.toFixed(1).replace('.', ',')}× a sua mediana`,
    comparable: true,
  };
}

/* ── Coorte ───────────────────────────────────────────────────────────────── */

export type Cohort = {
  platform: string;
  mediaType: string;
  snapshotKind: SnapshotKind;
  pillar?: string | null;
};

export const cohortKey = (c: Cohort): string =>
  [c.platform, c.mediaType, c.snapshotKind, c.pillar ?? 'any'].join(':');

/** Duas medições são comparáveis? Plataforma, tipo e idade têm de bater.
 *  O pilar só restringe quando ambos o declaram. */
export function sameCohort(a: Cohort, b: Cohort): boolean {
  if (a.platform !== b.platform) return false;
  if (a.mediaType !== b.mediaType) return false;
  if (a.snapshotKind !== b.snapshotKind) return false;
  if (a.pillar && b.pillar && a.pillar !== b.pillar) return false;
  return true;
}

/* ── Trial Reel ───────────────────────────────────────────────────────────── */

export const TRIAL_STATUSES = ['unknown', 'yes', 'no'] as const;
export type TrialStatus = (typeof TRIAL_STATUSES)[number];

export const TRIAL_SOURCES = ['api', 'carol_confirmation', 'imported_audit'] as const;
export type TrialSource = (typeof TRIAL_SOURCES)[number];

/** A API testada não distingue Trial Reel.
 *
 *  `media_product_type = REELS` não distingue, e `is_shared_to_feed = false`
 *  também não prova: uma corrida real mostrou cinco Reels normais recentes com
 *  `is_shared_to_feed=false`. Por isso esta função devolve sempre `unknown` a
 *  partir da API — e existe precisamente para que ninguém escreva a inferência
 *  errada num sítio qualquer. */
export function trialFromApi(_media: {
  mediaProductType: string;
  isSharedToFeed: boolean | null;
}): TrialStatus {
  void _media;
  return 'unknown';
}

/** Deve perguntar-se à Carol se este Reel foi um teste?
 *
 *  Uma vez só. «Não lembro» mantém `unknown` e não volta a interromper — o
 *  campo `promptedAt` é o que garante isso. */
export function shouldAskTrial(media: {
  trialStatus: TrialStatus;
  trialPromptedAt: string | null;
  mediaProductType: string;
}): boolean {
  if (media.mediaProductType !== 'REELS') return false;
  if (media.trialStatus !== 'unknown') return false;
  return media.trialPromptedAt === null;
}
