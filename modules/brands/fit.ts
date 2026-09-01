/** Carol Brand Fit Score.
 *
 *  O score serve para ordenar atenção, não para descartar marcas: uma marca
 *  atrativa com score baixo continua abordável, e por isso existe override.
 *
 *  Três regras que o código tem de garantir e o prompt não garantiria:
 *   1. tech-first pesa a favor;
 *   2. skincare e haircare nunca recebem bónus de categoria;
 *   3. cada ponto tem de conseguir dizer de onde veio.
 *
 *  Pesos e bandas vêm do Product Briefing §13. */

import { NICHE_POLICY_VERSION, isExcludedNiche, nicheById } from './niches';

export const FIT_POLICY_VERSION = `fit-v1+${NICHE_POLICY_VERSION}`;

export type FitCriterion =
  | 'category'
  | 'paid_maturity'
  | 'demo_potential'
  | 'budget_signals'
  | 'authentic_context'
  | 'economics'
  | 'recurring_demand'
  | 'aesthetic'
  | 'contact_access'
  | 'logistics'
  | 'portfolio_value';

export const FIT_WEIGHTS: Record<FitCriterion, number> = {
  category: 15,
  paid_maturity: 14,
  demo_potential: 14,
  budget_signals: 11,
  authentic_context: 10,
  economics: 10,
  recurring_demand: 8,
  aesthetic: 6,
  contact_access: 5,
  logistics: 4,
  portfolio_value: 3,
};

export const FIT_LABEL: Record<FitCriterion, string> = {
  category: 'Categoria tech-first',
  paid_maturity: 'Maturidade em paid media e criativos',
  demo_potential: 'Potencial de demonstração problema-solução',
  budget_signals: 'Sinais de orçamento de marketing',
  authentic_context: 'Contexto real de uso',
  economics: 'Economia da colaboração',
  recurring_demand: 'Procura criativa recorrente',
  aesthetic: 'Alinhamento estético',
  contact_access: 'Contato acessível',
  logistics: 'Logística e idioma',
  portfolio_value: 'Valor estratégico para o portfólio',
};

/** Notas de 0 a 5. Ausente significa desconhecido — e desconhecido não é zero:
 *  zero afirma «incompatível», e afirmar isso sem prova é exactamente o que o
 *  briefing proíbe. Um critério sem sinal fica em 3 (neutro) e é assinalado. */
export type FitSignals = Partial<Record<FitCriterion, number>> & {
  nicheId?: string | null;
  /** Sinais brutos que justificam as notas, salvos para explicabilidade. */
  evidence?: Record<string, string>;
};

export type FitLine = {
  criterion: FitCriterion;
  label: string;
  weight: number;
  score: number;
  points: number;
  assumed: boolean;
  note?: string;
};

export type FitBand = 'A' | 'B' | 'C' | 'low' | 'ignore';

export type FitResult = {
  score: number;
  band: FitBand;
  policyVersion: string;
  lines: FitLine[];
  unknowns: FitCriterion[];
  excludedNiche: boolean;
  summary: string;
};

const NEUTRAL = 3;

export function bandFor(score: number): FitBand {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'low';
  return 'ignore';
}

export const BAND_ACTION: Record<FitBand, string> = {
  A: 'Prioridade A — pesquisa profunda e abordagem muito personalizada.',
  B: 'Prioridade B — vale abordar com um ângulo concreto.',
  C: 'Prioridade C — só com produto forte, timing ou contato quente.',
  low: 'Prioridade baixa — pouca energia até aparecer sinal novo.',
  ignore: 'Sem prospecção ativa — manter apenas em observação.',
};

const clamp = (v: number) => Math.max(0, Math.min(5, v));

export function scoreBrandFit(
  signals: FitSignals,
  /** Se a marca cai num nicho que ela pôs no foco.
   *
   *  A categoria era pontuada só pela tabela tech-first, por isso um hotel
   *  levava a nota de «Outro» mesmo depois de ela ter posto hotéis de luxo no
   *  foco — e aparecia com «não pertence aos nichos prioritários» como risco.
   *  Quem decide o que é prioritário é ela. */
  opts: { inFocus?: boolean; focusLabel?: string } = {},
): FitResult {
  const niche = nicheById(signals.nicheId);
  const excluded = isExcludedNiche(signals.nicheId);

  const lines: FitLine[] = [];
  const unknowns: FitCriterion[] = [];

  for (const criterion of Object.keys(FIT_WEIGHTS) as FitCriterion[]) {
    let raw = signals[criterion];
    let note: string | undefined;

    if (criterion === 'category') {
      // A categoria não se adivinha a partir de um sinal solto: vem da política
      // de nichos, que é o único sítio onde skincare/haircare valem zero.
      // A exclusão continua a ganhar a tudo: skincare e haircare estão fora por
      // decisão de produto, e o foco não os pode trazer de volta.
      if (excluded) {
        raw = niche.fit;
        note = `${niche.label}: fora da estratégia. Sem bónus de categoria.`;
      } else if (opts.inFocus) {
        raw = 5;
        note = `${opts.focusLabel ?? niche.label}: está no foco dela.`;
      } else {
        raw = niche.fit;
        note = `${niche.label} (${niche.tier}).`;
      }
    }

    const assumed = raw === undefined || raw === null || Number.isNaN(raw);
    const score = clamp(assumed ? NEUTRAL : (raw as number));
    if (assumed) unknowns.push(criterion);

    lines.push({
      criterion,
      label: FIT_LABEL[criterion],
      weight: FIT_WEIGHTS[criterion],
      score,
      points: Math.round((score / 5) * FIT_WEIGHTS[criterion] * 100) / 100,
      assumed,
      note: note ?? signals.evidence?.[criterion],
    });
  }

  const score = Math.round(lines.reduce((sum, l) => sum + l.points, 0));
  const band = bandFor(score);

  const top = [...lines].sort((a, b) => b.points - a.points).slice(0, 2);
  const summary = excluded
    ? `Fora da estratégia tech-first (${niche.label}). Score ${score} sem qualquer bónus de categoria.`
    : `${score}/100 — puxam mais ${top.map((l) => l.label.toLowerCase()).join(' e ')}.`;

  return {
    score,
    band,
    policyVersion: FIT_POLICY_VERSION,
    lines,
    unknowns,
    excludedNiche: excluded,
    summary,
  };
}

/** Um override humano substitui o score, mas nunca apaga o cálculo: o motivo e
 *  o valor original ficam salvos ao lado. */
export type FitOverride = { score: number; reason: string; at: string; by: string };

export const effectiveFit = (computed: FitResult, override?: FitOverride | null) =>
  override
    ? { score: override.score, band: bandFor(override.score), overridden: true }
    : { score: computed.score, band: computed.band, overridden: false };
