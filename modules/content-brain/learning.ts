/** A escada da evidência: observação → sinal → hipótese → teste → aprendizado
 *  validado, ou rejeitado.
 *
 *  Existe porque o erro mais caro deste produto não é errar uma recomendação:
 *  é transformar um Reel forte em regra e passar três meses a repetir um
 *  formato por causa de uma coincidência. A auditoria T0 tem exatamente esse
 *  perigo — o Charabanc fez 13.912 views contra uma mediana de 2.006, e a
 *  leitura preguiçosa disso é «montagem estética é sempre superior».
 *
 *  Os limiares são **policy v1**. Não são ciência, são engenharia
 *  conservadora, e estão num objeto exportado para se mudarem sem tocar na
 *  lógica.
 *
 *  Regra que nenhum limiar dispensa: o motor só aprende sobre mecanismo que
 *  esteja registado na estrutura do conteúdo. Uma IA a ler o vídeo depois e a
 *  decidir que houve «gancho de vulnerabilidade» está a inventar a causa.
 *
 *  Puro. */

import type { Cohort } from './metrics';

export const LADDER = ['observation', 'signal', 'hypothesis', 'testing', 'validated', 'rejected'] as const;
export type LadderState = (typeof LADDER)[number];

export const isLadderState = (v: unknown): v is LadderState =>
  typeof v === 'string' && (LADDER as readonly string[]).includes(v);

export const LADDER_LABEL: Record<LadderState, string> = {
  observation: 'Observação',
  signal: 'Sinal',
  hypothesis: 'Hipótese',
  testing: 'Em teste',
  validated: 'Aprendizado validado',
  rejected: 'Não se sustentou',
};

/** O que o produto pode dizer em cada degrau. Sai literalmente para a tela:
 *  a diferença entre «há um sinal» e «descobrimos que» é a feature inteira. */
export const LADDER_PHRASING: Record<LadderState, string> = {
  observation: 'Aconteceu nesta peça.',
  signal: 'Há um sinal. Ainda não é padrão.',
  hypothesis: 'Vale repetir esse mecanismo em outra história real.',
  testing: 'Estamos testando isso agora.',
  validated: 'Isso se repetiu o suficiente para orientar decisão.',
  rejected: 'Não se sustentou. Parei de tratar como padrão.',
};

export const CONFIDENCE = ['low', 'medium', 'high'] as const;
export type Confidence = (typeof CONFIDENCE)[number];

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  low: 'baixa',
  medium: 'média',
  high: 'alta',
};

/* ── Política ─────────────────────────────────────────────────────────────── */

export type LearningPolicy = {
  version: string;
  /** Peças coerentes mínimas para sair de observação. */
  signalMinEvidence: number;
  /** Quanto acima da mediana uma única peça precisa de estar para, sozinha,
   *  valer como sinal. 2× é deliberadamente alto. */
  signalOutlierRatio: number;
  /** Peças independentes para um aprendizado validado. */
  validatedMinEvidence: number;
  /** Métricas alinhadas à função que têm de concordar. */
  validatedMinAgreeingMetrics: number;
  /** Abaixo disto uma métrica não conta como «acima». */
  materialRatio: number;
  /** Peças que contradizem e derrubam a hipótese. */
  rejectAfterContradictions: number;
};

export const LEARNING_POLICY_V1: LearningPolicy = {
  version: 'CAROL_LEARNING_POLICY_V1',
  signalMinEvidence: 2,
  signalOutlierRatio: 2,
  validatedMinEvidence: 3,
  validatedMinAgreeingMetrics: 2,
  materialRatio: 1.3,
  rejectAfterContradictions: 2,
};

/* ── Evidência ────────────────────────────────────────────────────────────── */

export type MetricEvidence = {
  name: string;
  /** Relativo à mediana da própria Carol, na mesma coorte. */
  relativeToMedian: number;
  /** Verdadeiro quando esta métrica é uma das que a função do pilar valoriza. */
  alignedWithFunction: boolean;
};

export type PieceEvidence = {
  mediaId: string;
  contentId: string | null;
  /** O mecanismo tem de estar registado na estrutura da peça, não inferido
   *  depois. Sem isto a peça não conta como evidência. */
  mechanismDeclared: boolean;
  cohort: Cohort;
  metrics: readonly MetricEvidence[];
  /** Contexto humano que a Carol acrescentou — «esse foi partilhado por uma
   *  página grande». Uma explicação externa desqualifica a peça como prova do
   *  mecanismo. */
  externalCause: boolean;
};

export type LearningCandidate = {
  mechanism: string;
  pillar: string | null;
  evidence: readonly PieceEvidence[];
  /** Peças em que o mecanismo esteve presente e não performou. */
  contradictions: readonly PieceEvidence[];
};

export type LadderVerdict = {
  state: LadderState;
  confidence: Confidence;
  sampleSize: number;
  agreeingMetrics: string[];
  /** Porquê, em português, para a tela e para o `ai_run`. */
  because: string;
  policyVersion: string;
};

const material = (m: MetricEvidence, policy: LearningPolicy) =>
  m.alignedWithFunction && m.relativeToMedian >= policy.materialRatio;

/** Onde é que este mecanismo está na escada.
 *
 *  Nunca salta degraus. Uma peça só, por mais forte que seja, chega a `signal`
 *  e para ali — e é isso que impede o produto de dizer «descobrimos que a sua
 *  audiência ama histórias de fracasso» depois de um Reel. */
export function classifyLadder(
  candidate: LearningCandidate,
  policy: LearningPolicy = LEARNING_POLICY_V1,
): LadderVerdict {
  const base = { policyVersion: policy.version };

  // Só conta o que tem mecanismo declarado na estrutura e não tem causa externa.
  const valid = candidate.evidence.filter((e) => e.mechanismDeclared && !e.externalCause);
  const n = valid.length;

  if (candidate.contradictions.length >= policy.rejectAfterContradictions && n < policy.validatedMinEvidence) {
    return {
      ...base,
      state: 'rejected',
      confidence: 'medium',
      sampleSize: n,
      agreeingMetrics: [],
      because: `O mesmo mecanismo apareceu em ${candidate.contradictions.length} peças sem o efeito. Parei de tratar como padrão.`,
    };
  }

  if (n === 0) {
    return {
      ...base,
      state: 'observation',
      confidence: 'low',
      sampleSize: 0,
      agreeingMetrics: [],
      because: 'Ainda não há nenhuma peça com esse mecanismo registado na estrutura.',
    };
  }

  // Métricas alinhadas que aparecem acima da mediana em pelo menos uma peça.
  const acima = new Map<string, number>();
  for (const peca of valid) {
    for (const m of peca.metrics) {
      if (material(m, policy)) acima.set(m.name, (acima.get(m.name) ?? 0) + 1);
    }
  }
  const agreeing = [...acima.keys()].sort();

  if (n === 1) {
    const forte = valid[0].metrics.some(
      (m) => m.alignedWithFunction && m.relativeToMedian >= policy.signalOutlierRatio,
    );
    return {
      ...base,
      state: forte ? 'signal' : 'observation',
      confidence: 'low',
      sampleSize: 1,
      agreeingMetrics: agreeing,
      because: forte
        ? 'Uma peça ficou muito acima da mediana. É um sinal, não um padrão.'
        : 'Uma peça. Fica como observação.',
    };
  }

  const coerentes = agreeing.filter((name) => (acima.get(name) ?? 0) >= policy.signalMinEvidence);

  if (n >= policy.validatedMinEvidence && coerentes.length >= policy.validatedMinAgreeingMetrics) {
    // Coortes diferentes é o que torna a repetição independente. Três peças no
    // mesmo dia e no mesmo formato são quase a mesma medição.
    const coortes = new Set(valid.map((e) => `${e.cohort.platform}:${e.cohort.mediaType}`));
    const independentes = valid.length >= policy.validatedMinEvidence;
    return {
      ...base,
      state: independentes ? 'validated' : 'hypothesis',
      confidence: coortes.size > 1 ? 'high' : 'medium',
      sampleSize: n,
      agreeingMetrics: coerentes,
      because: independentes
        ? `${n} peças com o mesmo mecanismo e ${coerentes.length} métricas alinhadas concordando.`
        : 'A repetição ainda não é independente o suficiente.',
    };
  }

  if (coerentes.length >= 1) {
    return {
      ...base,
      state: 'hypothesis',
      confidence: 'medium',
      sampleSize: n,
      agreeingMetrics: coerentes,
      because: `${n} peças coerentes em ${coerentes.join(' e ')}. Vale repetir em outra história real.`,
    };
  }

  return {
    ...base,
    state: 'signal',
    confidence: 'low',
    sampleSize: n,
    agreeingMetrics: agreeing,
    because: 'Há alguma coisa aí, mas as métricas ainda não concordam entre si.',
  };
}

/** Um estado pode influenciar o planeamento?
 *
 *  Só o validado ganha peso. O sinal pode sugerir; a hipótese pode pedir um
 *  teste. Nenhum dos dois impõe. */
export function influencesPlanning(state: LadderState): 'weight' | 'suggest' | 'none' {
  if (state === 'validated') return 'weight';
  if (state === 'signal' || state === 'hypothesis' || state === 'testing') return 'suggest';
  return 'none';
}

/* ── Proveniência ─────────────────────────────────────────────────────────── */

export type EvidenceKind = 'fact' | 'carol_meaning' | 'ai_suggestion' | 'performance_evidence' | 'editorial_rule';

export const EVIDENCE_LABEL: Record<EvidenceKind, string> = {
  fact: 'o que aconteceu',
  carol_meaning: 'palavras suas',
  ai_suggestion: 'sugestão minha',
  performance_evidence: 'dado do Instagram',
  editorial_rule: 'regra editorial',
};

export type Provenance = {
  kind: EvidenceKind;
  source: string;
  observedAt: string | null;
  sampleSize: number | null;
  method: string | null;
  confidence: Confidence | null;
};

/** Um insight sem proveniência não entra. A função devolve o que falta para
 *  quem chama poder recusar em vez de publicar um «a IA acha que». */
export function missingProvenance(p: Partial<Provenance>): string[] {
  const falta: string[] = [];
  if (!p.kind) falta.push('tipo de evidência');
  if (!p.source) falta.push('fonte');
  if (p.kind === 'performance_evidence') {
    if (p.sampleSize === null || p.sampleSize === undefined) falta.push('amostra');
    if (!p.method) falta.push('método');
  }
  return falta;
}
