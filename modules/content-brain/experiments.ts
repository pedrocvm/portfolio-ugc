/** Testes de conteúdo: comparar dois braços sem inventar significância.
 *
 *  Um teste no CarolOS não é um A/B com milhares de impressões. São três Reels
 *  contra três Reels. Por isso este módulo nunca diz «a variante venceu»: diz
 *  o que mudou, em que métrica, com que diferença, sobre que amostra, e se
 *  vale repetir.
 *
 *  Regras que o módulo faz cumprir:
 *
 *  1. **Só se compara a mesma idade.** Um Reel com duas horas contra um de
 *     trinta dias não é teste. Cada leitura traz a janela, e leituras de
 *     janelas diferentes não entram na mesma comparação.
 *  2. **Métrica ausente não é zero.** `null` sai da amostra; não entra como
 *     zero a puxar a mediana do braço para baixo.
 *  3. **Mediana, não média.** Três peças e um outlier: a média descreve o
 *     outlier, a mediana descreve o braço.
 *  4. **Sem amostra dos dois lados, é inconclusivo.** Não há veredito com um
 *     braço vazio, por mais forte que o outro esteja.
 *  5. **Uma métrica secundária que contradiz é dita.** Esconder o que não
 *     encaixa é como um teste vira superstição.
 *
 *  Puro. */

import type { SnapshotKind } from './metrics';

export const EXPERIMENT_POLICY_V1 = {
  version: 'CAROL_EXPERIMENT_POLICY_V1',
  /** Peças medidas por braço para haver veredito. Dois é pouco, e é
   *  deliberado: um teste de conteúdo dela raramente terá mais. */
  minPerArm: 2,
  /** Peças por braço a partir das quais a evidência é «consistente». */
  strongPerArm: 3,
  /** Diferença relativa abaixo da qual não se diz nada. */
  materialDiff: 0.2,
  /** Diferença a partir da qual o sinal é claro o suficiente para orientar o
   *  teste seguinte. */
  strongDiff: 0.4,
} as const;

export const EXPERIMENT_OUTCOMES = ['pending', 'inconclusive', 'favourable', 'contrary', 'consistent'] as const;
export type ExperimentOutcome = (typeof EXPERIMENT_OUTCOMES)[number];

export const OUTCOME_LABEL: Record<ExperimentOutcome, string> = {
  pending: 'Ainda coletando',
  inconclusive: 'Inconclusivo',
  favourable: 'Sinal favorável',
  contrary: 'Sinal contrário',
  consistent: 'Evidência consistente',
};

export const EXPERIMENT_STATUSES = ['planned', 'running', 'measured', 'learned', 'paused'] as const;
export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number];

/* ── Leituras ─────────────────────────────────────────────────────────────── */

export type ArmReading = {
  mediaId: string;
  /** A janela em que a leitura foi tirada. Só se comparam janelas iguais. */
  snapshotKind: SnapshotKind;
  /** Métrica interna → valor. `null` é ausência, nunca zero. */
  metrics: Readonly<Record<string, number | null>>;
};

export type Arm = {
  label: string;
  readings: readonly ArmReading[];
};

const mediana = (xs: readonly number[]): number | null => {
  const v = [...xs].sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

/** A janela onde os dois braços têm mais peças medidas nesta métrica.
 *
 *  Escolher a janela é o passo que impede a comparação de idades diferentes.
 *  Quando nenhuma janela tem peças dos dois lados, não há comparação. */
export function matchedWindow(
  control: Arm,
  variant: Arm,
  metric: string,
): { kind: SnapshotKind; control: number[]; variant: number[] } | null {
  const porJanela = (arm: Arm) => {
    const mapa = new Map<SnapshotKind, number[]>();
    for (const r of arm.readings) {
      const v = r.metrics[metric];
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      mapa.set(r.snapshotKind, [...(mapa.get(r.snapshotKind) ?? []), v]);
    }
    return mapa;
  };

  const a = porJanela(control);
  const b = porJanela(variant);
  let melhor: { kind: SnapshotKind; control: number[]; variant: number[] } | null = null;

  for (const [kind, ca] of a) {
    const cb = b.get(kind);
    if (!cb || !cb.length) continue;
    const peso = Math.min(ca.length, cb.length);
    if (!melhor || peso > Math.min(melhor.control.length, melhor.variant.length)) {
      melhor = { kind, control: ca, variant: cb };
    }
  }
  return melhor;
}

export type MetricComparison = {
  metric: string;
  window: SnapshotKind | null;
  controlMedian: number | null;
  variantMedian: number | null;
  /** Diferença relativa ao controlo. `null` quando não dá para comparar. */
  diff: number | null;
  direction: 'up' | 'down' | 'flat' | 'unknown';
  sample: { control: number; variant: number };
};

/** Quantas peças deste braço têm esta métrica medida, em qualquer janela.
 *
 *  Serve para a comparação continuar honesta quando não há janela comum: «duas
 *  de um lado e nenhuma do outro» é informação, e dizer «nenhuma dos dois
 *  lados» seria mentira. */
const measured = (arm: Arm, metric: string): number =>
  arm.readings.filter((r) => typeof r.metrics[metric] === 'number' && Number.isFinite(r.metrics[metric] as number)).length;

export function compareMetric(control: Arm, variant: Arm, metric: string, policy = EXPERIMENT_POLICY_V1): MetricComparison {
  const janela = matchedWindow(control, variant, metric);
  if (!janela) {
    return {
      metric, window: null, controlMedian: null, variantMedian: null, diff: null, direction: 'unknown',
      sample: { control: measured(control, metric), variant: measured(variant, metric) },
    };
  }
  const mc = mediana(janela.control);
  const mv = mediana(janela.variant);
  const diff = mc !== null && mv !== null && mc !== 0 ? (mv - mc) / Math.abs(mc) : null;

  return {
    metric,
    window: janela.kind,
    controlMedian: mc,
    variantMedian: mv,
    diff,
    direction: diff === null
      ? 'unknown'
      : diff >= policy.materialDiff
        ? 'up'
        : diff <= -policy.materialDiff
          ? 'down'
          : 'flat',
    sample: { control: janela.control.length, variant: janela.variant.length },
  };
}

/* ── Veredito ─────────────────────────────────────────────────────────────── */

export type ExperimentVerdict = {
  outcome: ExperimentOutcome;
  /** A explicação inteira, em português, com métrica, diferença e amostra. */
  because: string;
  primary: MetricComparison;
  secondary: MetricComparison[];
  /** Métricas secundárias que vão no mesmo sentido da principal. */
  supporting: string[];
  /** Métricas secundárias que vão contra. Sempre ditas. */
  contradicting: string[];
  sampleSize: number;
  /** Vale repetir o teste? Sim sempre que a diferença é material mas a
   *  amostra ainda é pequena. */
  repeatWorth: boolean;
  policyVersion: string;
};

const METRIC_LABEL: Record<string, string> = {
  views: 'visualizações',
  reach: 'alcance',
  likes: 'curtidas',
  comments: 'comentários',
  saves: 'salvamentos',
  shares: 'compartilhamentos',
  follows: 'seguidores',
  replies: 'respostas',
  avg_watch_time_seconds: 'retenção média',
  total_interactions: 'interações',
};

const nome = (m: string) => METRIC_LABEL[m] ?? m;
const pct = (d: number) => `${Math.round(Math.abs(d) * 100)}%`;

/** O que este teste mostrou — e o que não mostrou.
 *
 *  Nunca devolve «venceu». Devolve a variável, a métrica, a diferença, a
 *  amostra, o que apoia, o que contradiz e se vale repetir. */
export function experimentVerdict(input: {
  control: Arm;
  variant: Arm;
  primaryMetric: string;
  secondaryMetrics?: readonly string[];
  /** Qual é a direção boa desta métrica. Quase sempre «maior é melhor», mas
   *  não para skip rate. */
  higherIsBetter?: boolean;
  policy?: typeof EXPERIMENT_POLICY_V1;
}): ExperimentVerdict {
  const policy = input.policy ?? EXPERIMENT_POLICY_V1;
  const higher = input.higherIsBetter ?? true;
  const primary = compareMetric(input.control, input.variant, input.primaryMetric, policy);
  const secondary = (input.secondaryMetrics ?? []).map((m) => compareMetric(input.control, input.variant, m, policy));
  const amostra = primary.sample.control + primary.sample.variant;

  const base = { primary, secondary, sampleSize: amostra, policyVersion: policy.version };

  if (primary.diff === null || primary.sample.control < policy.minPerArm || primary.sample.variant < policy.minPerArm) {
    const falta = primary.window === null
      ? `tenho ${primary.sample.control} de um lado e ${primary.sample.variant} do outro, sem leituras da mesma idade para comparar ${nome(input.primaryMetric)}`
      : `tenho ${primary.sample.control} de um lado e ${primary.sample.variant} do outro; preciso de ${policy.minPerArm} em cada`;
    return {
      ...base,
      // Nada recolhido é «pendente»; recolhido só de um lado já é um teste que
      // não conclui — e a diferença muda o que a tela diz à Carol.
      outcome: primary.sample.control === 0 && primary.sample.variant === 0 ? 'pending' : 'inconclusive',
      because: `Ainda não dá para concluir: ${falta}.`,
      supporting: [],
      contradicting: [],
      repeatWorth: true,
    };
  }

  // «Melhor» depende da métrica, não do sinal da diferença.
  const melhorou = higher ? primary.diff > 0 : primary.diff < 0;
  const material = Math.abs(primary.diff) >= policy.materialDiff;

  const supporting = secondary.filter((s) => s.diff !== null && Math.abs(s.diff) >= policy.materialDiff && (s.diff > 0) === (primary.diff! > 0)).map((s) => s.metric);
  const contradicting = secondary.filter((s) => s.diff !== null && Math.abs(s.diff) >= policy.materialDiff && (s.diff > 0) !== (primary.diff! > 0)).map((s) => s.metric);

  if (!material) {
    return {
      ...base,
      outcome: 'inconclusive',
      because: `A diferença em ${nome(input.primaryMetric)} ficou em ${pct(primary.diff)} — dentro do que varia sozinho entre peças. Com ${primary.sample.control} contra ${primary.sample.variant} peças, não chamo isso de resultado.`,
      supporting,
      contradicting,
      repeatWorth: true,
    };
  }

  const forte = Math.abs(primary.diff) >= policy.strongDiff
    && primary.sample.control >= policy.strongPerArm
    && primary.sample.variant >= policy.strongPerArm
    && contradicting.length === 0;

  const direcao = melhorou ? 'acima' : 'abaixo';
  const frase = [
    `Mudando ${input.control.label} para ${input.variant.label}, ${nome(input.primaryMetric)} ficou ${pct(primary.diff)} ${direcao}`,
    `na leitura de ${primary.window} (mediana ${formatNum(primary.controlMedian)} contra ${formatNum(primary.variantMedian)}),`,
    `sobre ${primary.sample.control} contra ${primary.sample.variant} peças.`,
  ].join(' ');

  const apoio = supporting.length ? ` ${supporting.map(nome).join(' e ')} ${supporting.length === 1 ? 'vai' : 'vão'} no mesmo sentido.` : '';
  const contra = contradicting.length ? ` Mas ${contradicting.map(nome).join(' e ')} ${contradicting.length === 1 ? 'vai' : 'vão'} no sentido contrário — não é um resultado limpo.` : '';
  const tamanho = forte
    ? ' É evidência consistente o suficiente para orientar o próximo teste.'
    : ' É um sinal, não uma prova: a amostra ainda é pequena.';

  return {
    ...base,
    outcome: forte ? 'consistent' : melhorou ? 'favourable' : 'contrary',
    because: `${frase}${apoio}${contra}${tamanho}`,
    supporting,
    contradicting,
    repeatWorth: !forte || contradicting.length > 0,
  };
}

const formatNum = (v: number | null): string =>
  v === null ? 'indisponível' : new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(v);

/** Já tem dados suficientes para valer a pena olhar?
 *
 *  Serve o Hoje: um teste que atingiu a amostra mínima nos dois braços é a
 *  única razão pela qual um teste interrompe o dia dela. */
export function experimentReady(verdict: ExperimentVerdict, policy = EXPERIMENT_POLICY_V1): boolean {
  return (
    verdict.primary.sample.control >= policy.minPerArm &&
    verdict.primary.sample.variant >= policy.minPerArm &&
    verdict.outcome !== 'pending'
  );
}

/** O estado que a linha do teste deve passar a ter, dado o veredito.
 *
 *  Nunca salta para `learned` sozinho: transformar resultado em aprendizado é
 *  decisão dela, como fechar e perder. */
export function statusAfter(current: ExperimentStatus, verdict: ExperimentVerdict): ExperimentStatus {
  if (current === 'paused' || current === 'learned') return current;
  if (verdict.outcome === 'pending') return current === 'planned' ? 'planned' : 'running';
  if (verdict.outcome === 'inconclusive') return 'running';
  return 'measured';
}
