/** Direitos de uso. Produção e licença são coisas diferentes: a marca compra
 *  a criação de um vídeo e, à parte, compra o direito de o correr como
 *  anúncio, durante um tempo, em canais nomeados.
 *
 *  Nada aqui assume perpetuidade. Uma licença sem fim é sempre um sinal para
 *  revisão humana, nunca um valor por padrão. */

import { addDays, daysBetween } from '@/lib/time';

export type RightsScope = {
  organicAllowed: boolean;
  paidAllowed: boolean;
  platforms: readonly string[];
  territories: readonly string[];
  startAt: string | null;
  endAt: string | null;
  durationDays: number | null;
  whitelisting: boolean;
  exclusivity: boolean;
  exclusivityScope: string | null;
  exclusivityEndAt: string | null;
  rawFootage: boolean;
  portfolioPermission: boolean | null;
  thirdPartyUsage: boolean;
};

export const BLANK_RIGHTS: RightsScope = {
  organicAllowed: true,
  paidAllowed: false,
  platforms: [],
  territories: [],
  startAt: null,
  endAt: null,
  durationDays: null,
  whitelisting: false,
  exclusivity: false,
  exclusivityScope: null,
  exclusivityEndAt: null,
  rawFootage: false,
  portfolioPermission: null,
  thirdPartyUsage: false,
};

export type RiskFlag = {
  code: string;
  severity: 'low' | 'medium' | 'high';
  message: string;
  question?: string;
  humanOnly?: boolean;
};

/** Tudo o que numa licença tem de acender uma luz antes de ser aceite. */
export function rightsRisks(scope: RightsScope): RiskFlag[] {
  const flags: RiskFlag[] = [];

  if (scope.paidAllowed && !scope.endAt && !scope.durationDays) {
    flags.push({
      code: 'usage_no_period',
      severity: 'high',
      message: 'Uso pago pedido sem duração. Uma licença sem fim é perpetuidade por padrão.',
      question: 'Durante quanto tempo pretendem usar o vídeo em anúncios pagos?',
    });
  }

  if (scope.paidAllowed && scope.platforms.length === 0) {
    flags.push({
      code: 'usage_no_platforms',
      severity: 'high',
      message: 'Uso pago sem canais nomeados. Sem canais, a licença cobre tudo.',
      question: 'Em que plataformas vai correr o anúncio?',
    });
  }

  if (scope.paidAllowed && scope.territories.length === 0) {
    flags.push({
      code: 'usage_no_territory',
      severity: 'medium',
      message: 'Território não definido: a licença fica implicitamente mundial.',
      question: 'Em que mercados vai correr a campanha?',
    });
  }

  if (scope.whitelisting) {
    flags.push({
      code: 'whitelisting',
      severity: 'high',
      message: 'Whitelisting: a marca corre anúncios a partir do perfil da Carol. Nunca incluído por padrão.',
      humanOnly: true,
    });
  }

  if (scope.exclusivity) {
    flags.push({
      code: 'exclusivity',
      severity: 'high',
      message: scope.exclusivityEndAt
        ? 'Exclusividade pedida: bloqueia marcas concorrentes durante o período.'
        : 'Exclusividade pedida sem prazo. Exclusividade indefinida não se concede.',
      question: scope.exclusivityEndAt ? undefined : 'Qual é o escopo e a duração da exclusividade?',
      humanOnly: true,
    });
  }

  if (scope.rawFootage) {
    flags.push({
      code: 'raw_footage',
      severity: 'medium',
      message: 'Arquivos em bruto são uma entrega e uma licença à parte, não um extra grátis.',
      humanOnly: true,
    });
  }

  if (scope.thirdPartyUsage) {
    flags.push({
      code: 'third_party',
      severity: 'medium',
      message: 'Uso por revendedores ou parceiros alarga a licença para lá da marca.',
      humanOnly: true,
    });
  }

  if (scope.portfolioPermission === false) {
    flags.push({
      code: 'no_portfolio',
      severity: 'medium',
      message: 'Sem permissão de portfólio: o trabalho não pode virar prova comercial.',
    });
  }

  if (scope.portfolioPermission === null) {
    flags.push({
      code: 'portfolio_unknown',
      severity: 'low',
      message: 'Permissão de portfólio ainda não registada.',
      question: 'Posso mostrar este trabalho no meu portfólio?',
    });
  }

  return flags;
}

export function computeEnd(startAt: string | null, durationDays: number | null): string | null {
  if (!startAt || !durationDays) return null;
  return addDays(new Date(startAt), durationDays).toISOString().slice(0, 10);
}

export type ExpiryStatus =
  | { state: 'no_end'; message: string }
  | { state: 'active'; daysLeft: number }
  | { state: 'expiring'; daysLeft: number }
  | { state: 'expired'; daysAgo: number };

/** Janela de aviso: 21 dias chega para preparar e enviar uma renovação sem
 *  parecer apressado, e é curta o suficiente para a marca ainda ter a campanha
 *  em mente. */
export const RENEWAL_WINDOW_DAYS = 21;

export function expiryStatus(endAt: string | null, now = new Date()): ExpiryStatus {
  if (!endAt) {
    return { state: 'no_end', message: 'Licença sem data de fim registada.' };
  }
  const left = daysBetween(now, new Date(`${endAt}T23:59:59Z`));
  if (left < 0) return { state: 'expired', daysAgo: -left };
  if (left <= RENEWAL_WINDOW_DAYS) return { state: 'expiring', daysLeft: left };
  return { state: 'active', daysLeft: left };
}

/** Conflito de exclusividade: antes de aceitar uma marca nova, o sistema tem
 *  de saber se alguma licença ativa a proíbe. */
export function exclusivityConflicts(
  active: readonly { brandName: string; exclusivityScope: string | null; exclusivityEndAt: string | null }[],
  incomingCategory: string | null,
  now = new Date(),
): string[] {
  return active
    .filter((l) => !l.exclusivityEndAt || new Date(l.exclusivityEndAt) >= now)
    .filter((l) => {
      if (!incomingCategory || !l.exclusivityScope) return true; // escopo vago: avisa na mesma
      return l.exclusivityScope.toLowerCase().includes(incomingCategory.toLowerCase());
    })
    .map(
      (l) =>
        `${l.brandName} tem exclusividade ativa${
          l.exclusivityEndAt ? ` até ${l.exclusivityEndAt}` : ' sem prazo'
        }${l.exclusivityScope ? ` (${l.exclusivityScope})` : ''}.`,
    );
}
