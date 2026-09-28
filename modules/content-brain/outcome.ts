/** Como se julga uma peça.
 *
 *  Contra o objetivo para o qual foi planeada, e mais nada. Não existe «post
 *  vencedor» universal: um Reel de Atrair que trouxe alcance e nenhum
 *  comentário cumpriu a função; o mesmo número num post de Reter é um aviso.
 *
 *  Views não aparece em lado nenhum como critério isolado, de propósito.
 *
 *  Puro. */

import { OBJECTIVE_LABEL, OBJECTIVE_SIGNALS, OBJECTIVE_SIGNAL_LABEL, type Objective } from './editorial';
import type { CommunityAggregate } from './community';
import { LADDER_LABEL, type LadderState } from './learning';

/** Uma leitura de sinal já relativizada à mediana da própria Carol. `null`
 *  quando a métrica não existe — indisponível nunca é zero. */
export type SignalReading = {
  name: string;
  value: number | null;
  relativeToMedian: number | null;
};

export const OUTCOMES = ['met', 'partial', 'not_met', 'unknown'] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const OUTCOME_LABEL: Record<Outcome, string> = {
  met: 'Cumpriu o objetivo',
  partial: 'Cumpriu em parte',
  not_met: 'Não cumpriu',
  unknown: 'Ainda não dá para dizer',
};

export type ObjectiveReading = {
  objective: Objective;
  outcome: Outcome;
  because: string;
  /** Os sinais que foram olhados, e como se comportaram. */
  used: { name: string; label: string; relativeToMedian: number | null }[];
  /** Sinais que a peça devia ter e não tem medição. */
  missing: string[];
};

/** Acima disto um sinal conta como «acima». 1,3 é o mesmo limiar da escada de
 *  aprendizado — a régua tem de ser a mesma nos dois sítios. */
export const MATERIAL_RATIO = 1.3;

/** Lê uma peça contra o objetivo planeado.
 *
 *  A comunidade entra como sinal de primeira classe em Reter e Provar. É a
 *  decisão da Carol traduzida em código: interação significativa importa mais
 *  do que volume. */
export function readAgainstObjective(input: {
  objective: Objective;
  signals: readonly SignalReading[];
  community?: CommunityAggregate | null;
}): ObjectiveReading {
  const esperados = OBJECTIVE_SIGNALS[input.objective];
  const byName = new Map(input.signals.map((s) => [s.name, s]));

  const used: ObjectiveReading['used'] = [];
  const missing: string[] = [];

  for (const nome of esperados) {
    const s = byName.get(nome);
    if (!s || s.relativeToMedian === null) {
      // A comunidade cobre alguns nomes que a API não devolve.
      const daComunidade = communitySignal(nome, input.community ?? null);
      if (daComunidade === null) { missing.push(OBJECTIVE_SIGNAL_LABEL[nome] ?? nome); continue; }
      used.push({ name: nome, label: OBJECTIVE_SIGNAL_LABEL[nome] ?? nome, relativeToMedian: daComunidade });
      continue;
    }
    used.push({ name: nome, label: OBJECTIVE_SIGNAL_LABEL[nome] ?? nome, relativeToMedian: s.relativeToMedian });
  }

  if (used.length === 0) {
    return {
      objective: input.objective,
      outcome: 'unknown',
      because: `Nenhum sinal de ${OBJECTIVE_LABEL[input.objective].toLowerCase()} foi medido nesta peça.`,
      used,
      missing,
    };
  }

  const acima = used.filter((u) => (u.relativeToMedian ?? 0) >= MATERIAL_RATIO);
  const abaixo = used.filter((u) => (u.relativeToMedian ?? 0) < 1);

  const outcome: Outcome =
    acima.length >= 2 || (acima.length === 1 && used.length === 1) ? 'met'
    : acima.length === 1 ? 'partial'
    : abaixo.length === used.length ? 'not_met'
    : 'partial';

  return {
    objective: input.objective,
    outcome,
    because: porque(outcome, acima, abaixo, input.objective),
    used,
    missing,
  };
}

function porque(
  outcome: Outcome,
  acima: readonly { label: string }[],
  abaixo: readonly { label: string }[],
  objective: Objective,
): string {
  const alvo = OBJECTIVE_LABEL[objective].toLowerCase();
  if (outcome === 'met') return `Ficou acima da sua mediana em ${acima.map((a) => a.label).join(' e ')}. Era o que se queria para ${alvo}.`;
  if (outcome === 'partial') return acima.length
    ? `Subiu em ${acima.map((a) => a.label).join(' e ')}, mas não nos outros sinais de ${alvo}.`
    : `Ficou na média nos sinais de ${alvo}.`;
  if (outcome === 'not_met') return `Ficou abaixo da sua mediana em ${abaixo.map((a) => a.label).join(', ')}.`;
  return `Ainda não há sinal medido para ${alvo}.`;
}

/** A comunidade responde por sinais que a Graph API não dá. Devolve um valor
 *  relativo grosseiro — proporção de vínculo sobre classificados — ou `null`
 *  quando a amostra não sustenta leitura. */
function communitySignal(name: string, c: CommunityAggregate | null): number | null {
  if (!c || c.tooSmall || c.classified === 0) return null;
  const prop = (n: number) => (n / c.classified) * 2;
  switch (name) {
    case 'qualified_interaction': return prop(c.bond);
    case 'identification': return prop(c.counts.identification);
    case 'questions': return prop(c.counts.question + c.counts.curiosity);
    case 'recurring_conversation': return prop(c.counts.conversation);
    case 'work_conversation': return prop(c.counts.professional);
    case 'brand_interest': return prop(c.counts.brand + c.counts.purchase_intent);
    case 'brand_contact': return prop(c.counts.brand);
    default: return null;
  }
}

/* ── A escada, na linguagem do PDF ────────────────────────────────────────── */

/** O PDF nomeia quatro níveis; o código tem seis degraus com `check` no
 *  Postgres e testes desde 05/09. Os seis ficam; isto traduz para a tela.
 *
 *  `hypothesis` e `testing` são «padrão» com cautela — é exactamente o que o
 *  PDF descreve: «repetição suficiente para orientar decisões com cautela». */
export const LEARNING_LEVEL_VIEW: Record<LadderState, {
  level: 'observation' | 'signal' | 'pattern' | 'consolidated' | 'demoted';
  label: string;
}> = {
  observation: { level: 'observation', label: 'Observação' },
  signal: { level: 'signal', label: 'Sinal' },
  hypothesis: { level: 'pattern', label: 'Padrão' },
  testing: { level: 'pattern', label: 'Padrão' },
  validated: { level: 'consolidated', label: 'Aprendizado consolidado' },
  rejected: { level: 'demoted', label: 'Perdeu força' },
};

export const ladderView = (s: LadderState) => LEARNING_LEVEL_VIEW[s] ?? { level: 'observation', label: LADDER_LABEL[s] };
