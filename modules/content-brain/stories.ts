/** Stories: sequências, métricas derivadas e cobertura honesta.
 *
 *  Um Story sozinho diz pouco. O que a Carol publica são sequências — cinco
 *  frames de bastidores numa terça-feira — e é a sequência que se lê: quantos
 *  começaram, quantos chegaram ao fim, quem respondeu.
 *
 *  Três regras que este módulo faz cumprir:
 *
 *  1. **Agrupar é uma regra, não uma opinião.** Dois Stories pertencem à mesma
 *     sequência quando foram publicados no mesmo dia local e com menos de
 *     `gapMinutes` entre si. Uma IA pode sugerir uma etiqueta; não decide onde
 *     uma sequência acaba.
 *  2. **Proxy chama-se proxy.** «Retenção» exigiria saber quem viu o primeiro
 *     frame E o último. O que a API dá é alcance por frame; a razão entre o
 *     último e o primeiro é `reachRetentionProxy`, e a tela chama-lhe isso.
 *  3. **Sem amostra, «ainda não sei».** Uma comparação precisa de sequências
 *     de tamanho parecido; um conselho precisa de grupos com três de cada
 *     lado. Abaixo disso o produto diz que não sabe, e não usa benchmark de
 *     fora fingindo que veio dela.
 *
 *  Puro. */

export const STORY_SEQUENCE_POLICY_V1 = {
  version: 'CAROL_STORY_SEQUENCE_V1',
  /** Intervalo máximo entre dois frames da mesma sequência. */
  gapMinutes: 90,
  timeZone: 'Europe/Lisbon',
  /** Sequências de tamanho «comparável»: ±1 frame. */
  sizeTolerance: 1,
  /** Comparações só com pelo menos isto de sequências comparáveis. */
  minComparable: 3,
  /** Um conselho só com isto de sequências de cada lado. */
  minPerGroup: 3,
} as const;

export const STORY_SNAPSHOT_KINDS = ['t1h', 't6h', 't12h', 't23h'] as const;

/* ── Sequências ───────────────────────────────────────────────────────────── */

export type StoryFrame = {
  id: string;
  publishedAt: string;
  expiredAt?: string | null;
};

export type StorySequence = {
  /** Estável entre corridas: o instante do primeiro frame. */
  startedAt: string;
  endedAt: string;
  storyIds: string[];
  storyCount: number;
};

const localDayOf = (iso: string, timeZone: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));

/** Agrupa frames em sequências. Determinístico: a mesma entrada dá sempre a
 *  mesma saída, por isso correr de novo não muda nada — e uma sequência que
 *  ela corrigiu à mão fica `locked` e não passa por aqui. */
export function groupStorySequences(
  frames: readonly StoryFrame[],
  opts: { gapMinutes?: number; timeZone?: string } = {},
): StorySequence[] {
  const gap = (opts.gapMinutes ?? STORY_SEQUENCE_POLICY_V1.gapMinutes) * 60_000;
  const tz = opts.timeZone ?? STORY_SEQUENCE_POLICY_V1.timeZone;
  const ordered = [...frames]
    .filter((f) => Number.isFinite(Date.parse(f.publishedAt)))
    .sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt));

  const out: StorySequence[] = [];
  let atual: StorySequence | null = null;
  let ultimo = 0;
  let dia = '';

  for (const f of ordered) {
    const t = Date.parse(f.publishedAt);
    const d = localDayOf(f.publishedAt, tz);
    const junta = atual !== null && t - ultimo <= gap && d === dia;
    if (junta && atual) {
      atual.storyIds.push(f.id);
      atual.storyCount += 1;
      atual.endedAt = f.publishedAt;
    } else {
      atual = { startedAt: f.publishedAt, endedAt: f.publishedAt, storyIds: [f.id], storyCount: 1 };
      out.push(atual);
    }
    ultimo = t;
    dia = d;
  }
  return out;
}

/* ── Métricas de uma sequência ────────────────────────────────────────────── */

export type StoryReading = {
  id: string;
  publishedAt: string;
  reach: number | null;
  views: number | null;
  replies: number | null;
  shares: number | null;
  navigation: number | null;
  profileActivity: number | null;
  follows: number | null;
};

export type SequenceMetrics = {
  storyCount: number;
  /** Quantos frames têm alcance medido. Sem isto, «0 respostas» seria mentira. */
  measured: number;
  coverage: 'complete' | 'partial' | 'none';
  firstReach: number | null;
  lastReach: number | null;
  /** Último alcance sobre o primeiro. Não é retenção: é o que a API permite. */
  reachRetentionProxy: number | null;
  /** Queda de alcance frame a frame, em fração do anterior. */
  dropBetweenFrames: number[];
  replies: number | null;
  shares: number | null;
  navigation: number | null;
  profileActivity: number | null;
  follows: number | null;
  /** (respostas + partilhas) / alcance do primeiro frame. */
  interactionRate: number | null;
};

const soma = (xs: (number | null)[]): number | null => {
  const v = xs.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) : null;
};

export function sequenceMetrics(frames: readonly StoryReading[]): SequenceMetrics {
  const ordered = [...frames].sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt));
  const medidos = ordered.filter((f) => typeof f.reach === 'number');
  const first = medidos[0]?.reach ?? null;
  const last = medidos.length ? (medidos[medidos.length - 1].reach ?? null) : null;

  const drops: number[] = [];
  for (let i = 1; i < medidos.length; i++) {
    const a = medidos[i - 1].reach as number;
    const b = medidos[i].reach as number;
    if (a > 0) drops.push(Math.round(((a - b) / a) * 1000) / 1000);
  }

  const replies = soma(ordered.map((f) => f.replies));
  const shares = soma(ordered.map((f) => f.shares));

  return {
    storyCount: ordered.length,
    measured: medidos.length,
    coverage: medidos.length === 0 ? 'none' : medidos.length === ordered.length ? 'complete' : 'partial',
    firstReach: first,
    lastReach: last,
    reachRetentionProxy: first && last !== null && medidos.length >= 2 ? Math.round((last / first) * 1000) / 1000 : null,
    dropBetweenFrames: drops,
    replies,
    shares,
    navigation: soma(ordered.map((f) => f.navigation)),
    profileActivity: soma(ordered.map((f) => f.profileActivity)),
    follows: soma(ordered.map((f) => f.follows)),
    interactionRate: first && (replies !== null || shares !== null) ? Math.round((((replies ?? 0) + (shares ?? 0)) / first) * 10000) / 10000 : null,
  };
}

/* ── Comparar com as anteriores ───────────────────────────────────────────── */

export type SequenceComparison = {
  comparable: number;
  better: number;
  /** A frase da tela, ou nula quando não há amostra para a dizer. */
  line: string | null;
};

/** «Melhor que 4 das últimas 5 sequências de tamanho comparável.»
 *
 *  Compara pela proxy de retenção; sem proxy, pela taxa de interação. Só com
 *  três comparáveis — abaixo disso a frase seria estatística a fingir. */
export function compareSequence(
  target: SequenceMetrics,
  previous: readonly SequenceMetrics[],
  opts: { sizeTolerance?: number; minComparable?: number; window?: number } = {},
): SequenceComparison {
  const tol = opts.sizeTolerance ?? STORY_SEQUENCE_POLICY_V1.sizeTolerance;
  const min = opts.minComparable ?? STORY_SEQUENCE_POLICY_V1.minComparable;
  const window = opts.window ?? 5;

  const metric = (m: SequenceMetrics) => m.reachRetentionProxy ?? m.interactionRate ?? null;
  const mine = metric(target);
  if (mine === null) return { comparable: 0, better: 0, line: null };

  const iguais = previous
    .filter((p) => Math.abs(p.storyCount - target.storyCount) <= tol && metric(p) !== null)
    .slice(0, window);
  if (iguais.length < min) return { comparable: iguais.length, better: 0, line: null };

  const better = iguais.filter((p) => (metric(p) as number) < mine).length;
  return {
    comparable: iguais.length,
    better,
    line: `Melhor que ${better} das últimas ${iguais.length} sequências de tamanho comparável.`,
  };
}

/* ── Cobertura ────────────────────────────────────────────────────────────── */

const dataPt = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Lisbon' });

/** Diz o que há, e desde quando. Nunca «0 Stories» quando o que há é «não
 *  tenho histórico anterior». */
export function storyCoverage(input: {
  firstCapturedAt: string | null;
  storiesCaptured: number;
  syncScheduled: boolean;
}): { since: string | null; line: string } {
  if (!input.syncScheduled && input.storiesCaptured === 0) {
    return { since: null, line: 'Ainda não há histórico de Stories: a captura automática não está ligada. Stories anteriores não estão disponíveis na API.' };
  }
  if (input.storiesCaptured === 0 || !input.firstCapturedAt) {
    return { since: null, line: 'A captura automática está ligada. Ainda não apanhou nenhum Story — o histórico começa no próximo que publicar.' };
  }
  return {
    since: input.firstCapturedAt,
    line: `Histórico automático de Stories desde ${dataPt(input.firstCapturedAt)}. O que veio antes não está disponível na API.`,
  };
}

/* ── O que as sequências ensinam ──────────────────────────────────────────── */

export type SequenceForGuidance = {
  startedAt: string;
  metrics: SequenceMetrics;
  tags: readonly string[];
};

export type StoryGuidance = {
  lines: { text: string; sample: string; confidence: 'low' | 'medium' }[];
  because: string;
};

const mediana = (xs: number[]): number | null => {
  const v = [...xs].sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Compara grupos de sequências — por etiqueta, e por tamanho — e só fala
 *  quando cada lado tem amostra. Nunca usa um número que não seja dela. */
export function storyGuidance(
  sequences: readonly SequenceForGuidance[],
  opts: { minPerGroup?: number; weeks?: number; now?: Date } = {},
): StoryGuidance {
  const min = opts.minPerGroup ?? STORY_SEQUENCE_POLICY_V1.minPerGroup;
  const weeks = opts.weeks ?? 4;
  const now = opts.now ?? new Date();
  const desde = now.getTime() - weeks * 7 * 86_400_000;

  const recentes = sequences.filter(
    (s) => Date.parse(s.startedAt) >= desde && s.metrics.reachRetentionProxy !== null,
  );

  if (recentes.length < min * 2) {
    return {
      lines: [],
      because: `Ainda não sei: ${recentes.length} ${recentes.length === 1 ? 'sequência medida' : 'sequências medidas'} nas últimas ${weeks} semanas. Preciso de pelo menos ${min * 2} para comparar.`,
    };
  }

  const lines: StoryGuidance['lines'] = [];
  const proxy = (s: SequenceForGuidance) => s.metrics.reachRetentionProxy as number;

  // Curtas vs longas.
  const curtas = recentes.filter((s) => s.metrics.storyCount <= 3);
  const longas = recentes.filter((s) => s.metrics.storyCount >= 5);
  if (curtas.length >= min && longas.length >= min) {
    const mc = mediana(curtas.map(proxy))!;
    const ml = mediana(longas.map(proxy))!;
    if (Math.abs(mc - ml) >= 0.1) {
      const [melhor, pior, a, b] = mc > ml ? ['curtas (até 3)', 'longas (5 ou mais)', mc, ml] : ['longas (5 ou mais)', 'curtas (até 3)', ml, mc];
      lines.push({
        text: `Nas últimas ${weeks} semanas, sequências ${melhor} mantiveram mais gente até ao fim do que as ${pior}: ${pct(a)} contra ${pct(b)} do alcance inicial.`,
        sample: `Amostra: ${mc > ml ? curtas.length : longas.length} vs ${mc > ml ? longas.length : curtas.length} sequências.`,
        confidence: recentes.length >= min * 4 ? 'medium' : 'low',
      });
    }
  }

  // Por etiqueta: cada etiqueta com amostra contra as sem ela.
  const etiquetas = new Set(recentes.flatMap((s) => s.tags));
  for (const tag of etiquetas) {
    const com = recentes.filter((s) => s.tags.includes(tag));
    const sem = recentes.filter((s) => !s.tags.includes(tag));
    if (com.length < min || sem.length < min) continue;
    const a = mediana(com.map(proxy))!;
    const b = mediana(sem.map(proxy))!;
    if (Math.abs(a - b) < 0.1) continue;
    lines.push({
      text: a > b
        ? `Sequências «${tag}» mantiveram mais gente até ao fim do que as outras: ${pct(a)} contra ${pct(b)}.`
        : `Sequências «${tag}» perderam mais gente até ao fim do que as outras: ${pct(a)} contra ${pct(b)}.`,
      sample: `Amostra: ${com.length} vs ${sem.length} sequências.`,
      confidence: com.length >= min * 2 && sem.length >= min * 2 ? 'medium' : 'low',
    });
  }

  return {
    lines: lines.slice(0, 4),
    because: lines.length
      ? `${recentes.length} sequências medidas nas últimas ${weeks} semanas. É pouco para regra; chega para escolher o próximo teste.`
      : `${recentes.length} sequências medidas, mas nenhuma diferença grande o suficiente entre grupos. Ainda não sei.`,
  };
}
