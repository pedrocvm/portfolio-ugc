/** Motor de preço. Determinístico e versionado.
 *
 *  A regra que este arquivo existe para garantir: quando a política não tem
 *  um valor, o motor devolve «por resolver» — não inventa, não interpola a
 *  partir de uma negociação antiga, e não deixa um modelo preencher o buraco.
 *
 *  O único número documentado hoje é a negociação AllMatters (base 130 €,
 *  3 meses +50%, 6 meses +70%). Está salvo como referência histórica na
 *  política e é isso que é: evidência de uma negociação, não uma tabela. */

import { applyPercent, sumCents } from '@/lib/money';
import { z } from 'zod';

export const PricingRulesSchema = z.object({
  base: z
    .object({
      single_video_cents: z.number().int().nonnegative().nullable().optional(),
      unresolved_reason: z.string().optional(),
    })
    .optional(),
  packages: z
    .record(
      z.string(),
      z
        .object({
          videos: z.number().int().positive(),
          price_cents: z.number().int().nonnegative(),
        })
        .nullable(),
    )
    .optional(),
  minimum_project_floor_cents: z.number().int().nonnegative().nullable().optional(),
  paid_usage: z
    .object({
      model: z.literal('percent_of_base').optional(),
      terms: z.record(z.string(), z.number().nullable()).optional(),
      unresolved_reason: z.string().optional(),
    })
    .optional(),
  raw_footage: z.object({ percent_of_base: z.number() }).nullable().optional(),
  whitelisting: z.object({ percent_of_base: z.number() }).nullable().optional(),
  exclusivity: z.object({ percent_of_base: z.number() }).nullable().optional(),
  buyout_perpetual: z.object({ allowed: z.boolean(), reason: z.string().optional() }).optional(),
  rush: z.object({ percent_of_base: z.number() }).nullable().optional(),
  revisions_included: z.number().int().nonnegative().nullable().optional(),
  payment_terms: z.string().nullable().optional(),
  extra_hook_cents: z.number().int().nonnegative().nullable().optional(),
  extra_variation_cents: z.number().int().nonnegative().nullable().optional(),
  historical_reference: z.record(z.string(), z.unknown()).optional(),
});

export type PricingRules = z.infer<typeof PricingRulesSchema>;

export const USAGE_TERMS = ['30d', '3m', '6m', '12m'] as const;
export type UsageTerm = (typeof USAGE_TERMS)[number];

export const USAGE_TERM_LABEL: Record<UsageTerm, string> = {
  '30d': '30 dias',
  '3m': '3 meses',
  '6m': '6 meses',
  '12m': '12 meses',
};

export const USAGE_TERM_DAYS: Record<UsageTerm, number> = {
  '30d': 30,
  '3m': 90,
  '6m': 180,
  '12m': 365,
};

export const ScopeSchema = z.object({
  videos: z.number().int().positive().default(1),
  packageId: z.string().optional(),
  extraHooks: z.number().int().nonnegative().default(0),
  extraVariations: z.number().int().nonnegative().default(0),
  rawFootage: z.boolean().default(false),
  rush: z.boolean().default(false),
  paidUsage: z.boolean().default(false),
  usageTerm: z.enum(USAGE_TERMS).nullable().default(null),
  platforms: z.array(z.string()).default([]),
  territories: z.array(z.string()).default([]),
  whitelisting: z.boolean().default(false),
  exclusivity: z.boolean().default(false),
  perpetual: z.boolean().default(false),
  revisions: z.number().int().nonnegative().nullable().default(null),
  currency: z.string().default('EUR'),
});

export type Scope = z.infer<typeof ScopeSchema>;

export type LineItem = {
  id: string;
  label: string;
  cents: number | null;
  /** Porque este item existe e de onde saiu o valor. */
  basis: string;
  unresolved?: string;
};

export type Unresolved = { key: string; label: string; why: string };

export type QuoteResult = {
  policyVersion: string;
  currency: string;
  lines: LineItem[];
  baseCents: number;
  adjustmentsCents: number;
  recommendedCents: number | null;
  minimumCents: number | null;
  unresolved: Unresolved[];
  /** Perguntas que têm de ser feitas à marca antes de fechar um valor. */
  blockingQuestions: string[];
  /** Decisões que só uma pessoa pode tomar. */
  humanOnly: string[];
  complete: boolean;
};

const need = (list: Unresolved[], key: string, label: string, why: string) => {
  if (!list.some((u) => u.key === key)) list.push({ key, label, why });
};

export function calculateQuote(
  rulesInput: unknown,
  scopeInput: unknown,
  policyVersion: string,
): QuoteResult {
  const rules = PricingRulesSchema.parse(rulesInput ?? {});
  const scope = ScopeSchema.parse(scopeInput ?? {});

  const lines: LineItem[] = [];
  const unresolved: Unresolved[] = [];
  const blockingQuestions: string[] = [];
  const humanOnly: string[] = [];

  // ── Produção ────────────────────────────────────────────────────────────
  const pkg = scope.packageId ? rules.packages?.[scope.packageId] : null;
  const baseUnit = rules.base?.single_video_cents ?? null;

  let baseCents = 0;
  if (pkg) {
    baseCents = pkg.price_cents;
    lines.push({
      id: 'package',
      label: `Pacote ${scope.packageId} (${pkg.videos} vídeos)`,
      cents: pkg.price_cents,
      basis: `Preço de pacote definido na política ${policyVersion}.`,
    });
  } else if (baseUnit !== null) {
    baseCents = baseUnit * scope.videos;
    lines.push({
      id: 'base',
      label: `Produção · ${scope.videos} vídeo${scope.videos > 1 ? 's' : ''}`,
      cents: baseCents,
      basis: `Valor base por vídeo da política ${policyVersion}.`,
    });
  } else {
    lines.push({
      id: 'base',
      label: `Produção · ${scope.videos} vídeo${scope.videos > 1 ? 's' : ''}`,
      cents: null,
      basis: 'Sem valor base configurado.',
      unresolved: 'base',
    });
    need(
      unresolved,
      'base',
      'Valor base por vídeo',
      rules.base?.unresolved_reason ??
        'A política ativa não define um valor base. O motor não o pode inferir de uma negociação anterior.',
    );
  }

  // ── Extras de produção ──────────────────────────────────────────────────
  const addExtra = (
    id: string,
    label: string,
    count: number,
    unit: number | null | undefined,
    unresolvedLabel: string,
  ) => {
    if (count <= 0) return;
    if (unit == null) {
      lines.push({ id, label: `${label} ×${count}`, cents: null, basis: 'Sem valor configurado.', unresolved: id });
      need(unresolved, id, unresolvedLabel, 'A política ativa não define este extra.');
      return;
    }
    lines.push({
      id,
      label: `${label} ×${count}`,
      cents: unit * count,
      basis: `Valor unitário da política ${policyVersion}.`,
    });
  };

  addExtra('extra_hooks', 'Hooks adicionais', scope.extraHooks, rules.extra_hook_cents, 'Preço por hook adicional');
  addExtra(
    'extra_variations',
    'Variações adicionais',
    scope.extraVariations,
    rules.extra_variation_cents,
    'Preço por variação adicional',
  );

  const percentLine = (
    id: string,
    label: string,
    rule: { percent_of_base: number } | null | undefined,
    unresolvedLabel: string,
    why: string,
  ) => {
    if (rule == null) {
      lines.push({ id, label, cents: null, basis: 'Sem regra configurada.', unresolved: id });
      need(unresolved, id, unresolvedLabel, why);
      return;
    }
    lines.push({
      id,
      label: `${label} (+${rule.percent_of_base}%)`,
      cents: baseCents ? applyPercent(baseCents, rule.percent_of_base) : null,
      basis: `${rule.percent_of_base}% sobre a produção, política ${policyVersion}.`,
      ...(baseCents ? {} : { unresolved: 'base' }),
    });
  };

  if (scope.rush) {
    percentLine('rush', 'Urgência', rules.rush, 'Acréscimo de urgência',
      'A política ativa não define acréscimo por urgência.');
  }

  if (scope.rawFootage) {
    percentLine('raw_footage', 'Arquivos em bruto', rules.raw_footage, 'Preço dos arquivos em bruto',
      'Arquivos em bruto nunca estão incluídos por padrão e a política ainda não tem preço.');
    humanOnly.push('Arquivos em bruto: entrega separada, decisão da Carol.');
  }

  // ── Licença de uso pago ─────────────────────────────────────────────────
  if (scope.paidUsage) {
    if (!scope.usageTerm) {
      lines.push({
        id: 'paid_usage',
        label: 'Uso pago',
        cents: null,
        basis: 'Período não indicado pela marca.',
        unresolved: 'usage_term',
      });
      need(unresolved, 'usage_term', 'Período de uso pago',
        'A marca pediu direitos para anúncios sem indicar duração.');
      blockingQuestions.push(
        'Durante quanto tempo pretendem correr o vídeo como anúncio pago?',
      );
    } else {
      const pct = rules.paid_usage?.terms?.[scope.usageTerm] ?? null;
      if (pct == null) {
        lines.push({
          id: 'paid_usage',
          label: `Uso pago · ${USAGE_TERM_LABEL[scope.usageTerm]}`,
          cents: null,
          basis: 'Sem porcentagem configurada para este período.',
          unresolved: 'usage_rate',
        });
        need(unresolved, 'usage_rate', `Percentagem de uso pago para ${USAGE_TERM_LABEL[scope.usageTerm]}`,
          rules.paid_usage?.unresolved_reason ?? 'A política ativa não define esta porcentagem.');
      } else {
        lines.push({
          id: 'paid_usage',
          label: `Uso pago · ${USAGE_TERM_LABEL[scope.usageTerm]} (+${pct}%)`,
          cents: baseCents ? applyPercent(baseCents, pct) : null,
          basis: `${pct}% sobre a produção, política ${policyVersion}.`,
          ...(baseCents ? {} : { unresolved: 'base' }),
        });
      }
    }

    if (scope.platforms.length === 0) {
      blockingQuestions.push('Em que plataformas vai correr o anúncio?');
      need(unresolved, 'usage_platforms', 'Plataformas do uso pago',
        'Sem canais definidos, a licença fica aberta e impossível de precificar.');
    }
    if (scope.territories.length === 0) {
      blockingQuestions.push('Em que mercados vai correr a campanha?');
    }
  }

  if (scope.whitelisting) {
    percentLine('whitelisting', 'Whitelisting', rules.whitelisting, 'Preço de whitelisting',
      'Whitelisting não está incluído por padrão e a política ainda não tem preço.');
    humanOnly.push('Whitelisting: correr anúncios a partir do perfil da Carol. Decisão dela.');
  }

  if (scope.exclusivity) {
    percentLine('exclusivity', 'Exclusividade', rules.exclusivity, 'Preço de exclusividade',
      'Exclusividade bloqueia marcas concorrentes e a política ainda não tem preço nem limite.');
    humanOnly.push('Exclusividade: escopo e duração têm de ser decididos por pessoa.');
  }

  if (scope.perpetual) {
    lines.push({
      id: 'perpetual',
      label: 'Uso perpétuo / buyout',
      cents: null,
      basis: 'Não concedido por padrão.',
      unresolved: 'perpetual',
    });
    need(unresolved, 'perpetual', 'Uso perpétuo',
      rules.buyout_perpetual?.reason ??
        'Perpetuidade nunca é concedida por padrão: é uma cedência sem retorno futuro.');
    humanOnly.push('Uso perpétuo ou buyout: apenas por decisão explícita da Carol.');
  }

  // ── Total ───────────────────────────────────────────────────────────────
  const known = lines.filter((l) => l.cents !== null).map((l) => l.cents as number);
  const anyUnresolved = lines.some((l) => l.cents === null) || unresolved.length > 0;

  const adjustmentsCents = sumCents(
    lines.filter((l) => l.id !== 'base' && l.id !== 'package' && l.cents !== null).map((l) => l.cents as number),
  );

  const floor = rules.minimum_project_floor_cents ?? null;
  if (floor == null) {
    need(unresolved, 'floor', 'Piso mínimo por projeto',
      'Sem piso configurado o copiloto não consegue avisar quando um valor fica abaixo do aceitável.');
  }

  return {
    policyVersion,
    currency: scope.currency,
    lines,
    baseCents,
    adjustmentsCents,
    recommendedCents: anyUnresolved ? null : sumCents(known),
    minimumCents: floor,
    unresolved,
    blockingQuestions,
    humanOnly,
    complete: !anyUnresolved,
  };
}

/** Verificação de piso. Separada do cálculo porque também se aplica a um valor
 *  escrito à mão pela Carol, e não só ao que o motor sugeriu. */
export function checkFloor(finalCents: number, minimumCents: number | null) {
  if (minimumCents == null) {
    return {
      belowFloor: false,
      warning: 'Não existe piso configurado: não é possível validar se o valor é aceitável.',
    };
  }
  return finalCents < minimumCents
    ? {
        belowFloor: true,
        warning: `Abaixo do piso de ${minimumCents / 100} ${''}— precisa de justificação e aprovação explícita.`,
      }
    : { belowFloor: false, warning: null };
}
