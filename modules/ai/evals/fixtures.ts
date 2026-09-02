/** Conjunto de avaliação da camada de IA.
 *
 *  Casos reais da operação da Carol, anonimizados onde era preciso. Cada um
 *  diz o que a extração TEM de apanhar, o que NÃO pode inventar, e que ações
 *  seriam aceitáveis a seguir.
 *
 *  Isto não corre em cada build: chamar um modelo por commit é caro e lento, e
 *  a variação natural do modelo transformaria o CI numa moeda ao ar. Corre com
 *  `npm run eval:ai`, quando há uma mudança de prompt para avaliar.
 *
 *  As asserções determinísticas — as que não dependem de modelo — vivem em
 *  `evals.test.ts` e essas correm sempre. */

import type { ReplyType } from '../schemas';

export type Fixture = {
  id: string;
  note: string;
  message: string;
  threadContext?: string;
  expect: {
    /** Tem de aparecer. */
    replyTypes: ReplyType[];
    /** Não pode aparecer. */
    forbiddenReplyTypes?: ReplyType[];
    paidUsageRequested?: boolean;
    /** Um valor concreto, em cêntimos, quando a mensagem o diz. */
    cashAmountCents?: number | null;
    usagePeriodMentioned?: boolean;
    promisedReplyDate?: boolean;
    explicitAcceptance?: boolean;
    explicitRejection?: boolean;
    deferral?: boolean;
    /** Campos que o modelo tem de deixar vazios: a mensagem não os diz. */
    mustNotInvent: string[];
    /** Uma destas ações é aceitável a seguir. */
    acceptableActions: string[];
  };
};

export const FIXTURES: Fixture[] = [
  {
    id: 'rate_request_with_ads',
    note: 'AllMatters: pediu rate para um vídeo com direitos de anúncios, sem indicar período.',
    message: `Hi Carol, thanks for reaching out on Instagram!
Could you please send over your portfolio, an example of your work spoken in
English, and your rates for 1 UGC video with ads rights?
Best, Camilla`,
    expect: {
      replyTypes: ['rate_request', 'ads_rights', 'portfolio_request'],
      paidUsageRequested: true,
      usagePeriodMentioned: false,
      cashAmountCents: null,
      mustNotInvent: ['usage_period', 'cash_amount_cents', 'deadline'],
      acceptableActions: ['ASK_SCOPE', 'SEND_RATE', 'RESPOND'],
    },
  },
  {
    id: 'media_kit_confusion',
    note: 'Lead de fitness: pediu mídia kit e demografia — confusão entre UGC e influencer.',
    message: `Oi! Adorámos o teu perfil. Podes enviar o teu media kit com número de
seguidores, visualizações médias e demografia da audiência? Queremos avaliar o
alcance antes de avançar.`,
    expect: {
      replyTypes: ['media_kit_request'],
      forbiddenReplyTypes: ['approval'],
      paidUsageRequested: false,
      mustNotInvent: ['cash_amount_cents', 'usage_period'],
      acceptableActions: ['NEGOTIATE', 'RESPOND', 'ASK_SCOPE'],
    },
  },
  {
    id: 'barter_low_value',
    note: 'NOVOTECK: só produto, e produto barato.',
    message: `Olá Carol, gostámos da tua abordagem. Podemos enviar-te um pau de selfie e
um power bank de carga rápida em troca de dois vídeos. Fazes?`,
    expect: {
      replyTypes: ['barter_offer'],
      paidUsageRequested: false,
      cashAmountCents: null,
      mustNotInvent: ['cash_amount_cents', 'barter_value_cents'],
      acceptableActions: ['NEGOTIATE', 'ASK_SCOPE', 'DECLINE'],
    },
  },
  {
    id: 'affiliate_disguised',
    note: 'Programa de afiliados apresentado como parceria UGC.',
    message: `Hi! We'd love to partner with you. You'd get a 15% commission on every sale
made with your code, plus free products. No upfront payment, but the earning
potential is unlimited!`,
    expect: {
      replyTypes: ['affiliate_offer'],
      paidUsageRequested: false,
      cashAmountCents: null,
      mustNotInvent: ['cash_amount_cents'],
      acceptableActions: ['NEGOTIATE', 'DECLINE', 'RESPOND'],
    },
  },
  {
    id: 'promised_date',
    note: 'A marca prometeu responder numa data concreta.',
    message: `Obrigada pela proposta, Carol. Vou apresentá-la à equipe esta semana e dou-te
uma resposta definitiva na sexta-feira, dia 11.`,
    expect: {
      replyTypes: ['future_followup'],
      promisedReplyDate: true,
      explicitAcceptance: false,
      mustNotInvent: ['cash_amount_cents', 'usage_period'],
      acceptableActions: ['FOLLOW_UP', 'NURTURE'],
    },
  },
  {
    id: 'enthusiasm_not_acceptance',
    note: 'Entusiasmo sem aceitação. O sistema não pode fechar aqui.',
    message: `Carol, adorámos mesmo o conceito! A equipe toda achou brilhante. Vamos ver
como encaixamos isto no plano do trimestre.`,
    expect: {
      replyTypes: ['interest'],
      explicitAcceptance: false,
      mustNotInvent: ['cash_amount_cents', 'deadline'],
      acceptableActions: ['FOLLOW_UP', 'RESPOND', 'ASK_SCOPE'],
    },
  },
  {
    id: 'explicit_acceptance_with_price',
    note: 'Aceitação clara, com o valor escrito.',
    message: `Fechado, Carol. Aprovámos os 195€ pelo vídeo com três meses de uso pago em
Meta. Enviamos o produto esta semana e o briefing amanhã.`,
    expect: {
      replyTypes: ['approval'],
      explicitAcceptance: true,
      paidUsageRequested: true,
      usagePeriodMentioned: true,
      cashAmountCents: 19500,
      mustNotInvent: [],
      acceptableActions: ['START_PRODUCTION', 'CLOSE', 'RESPOND'],
    },
  },
  {
    id: 'rejection_not_now',
    note: '«Agora não» é nurture, não perda.',
    message: `Olá Carol, obrigada pelo contato. Neste momento não estamos fazendo
parcerias, mas voltamos a falar quando abrirmos o próximo ciclo de campanhas.`,
    expect: {
      replyTypes: ['rejection', 'future_followup'],
      explicitRejection: true,
      deferral: true,
      mustNotInvent: ['cash_amount_cents'],
      acceptableActions: ['NURTURE'],
    },
  },
  {
    id: 'scope_creep_revision',
    note: 'Pedido de revisão que é, na verdade, um briefing novo.',
    message: `Carol, o vídeo ficou ótimo! Só uma coisa: podes refazer com o outro produto
da linha e mudar a mensagem para focar em sustentabilidade? E já agora manda
também uma versão de 15 segundos para o TikTok.`,
    expect: {
      replyTypes: ['revision'],
      mustNotInvent: ['cash_amount_cents'],
      acceptableActions: ['NEGOTIATE', 'RESPOND', 'ASK_SCOPE'],
    },
  },
  {
    id: 'perpetual_rights_buried',
    note: 'Uso perpétuo escondido em linguagem simpática.',
    message: `We love it! Just so we're aligned — we'd need full ownership of the content
so we can use it across all our channels, forever, and adapt it as needed.
Standard for all our creators.`,
    expect: {
      replyTypes: ['ads_rights'],
      paidUsageRequested: true,
      usagePeriodMentioned: false,
      mustNotInvent: ['cash_amount_cents'],
      acceptableActions: ['NEGOTIATE', 'ASK_SCOPE', 'DECLINE'],
    },
  },
  {
    id: 'brief_with_gaps',
    note: 'Briefing que parece completo e não tem período de uso nem revisões.',
    message: `Briefing — Robô limpa-vidros
Objetivo: mostrar como poupa tempo.
Público: mulheres 25-40, casa própria.
Mensagens: poupa tempo, não risca o vidro, funciona sozinho.
Não dizer: que substitui limpeza profissional.
CTA: link na bio.
Formato: vertical, 30s.
Prazo: 15 de setembro.`,
    expect: {
      replyTypes: ['brief'],
      mustNotInvent: ['usage_period', 'cash_amount_cents'],
      acceptableActions: ['REQUEST_METRICS', 'RESPOND', 'ASK_SCOPE', 'START_PRODUCTION'],
    },
  },
  {
    id: 'newsletter_not_commercial',
    note: 'Ruído. Não pode criar marca nenhuma.',
    message: `🔥 Últimas 24 horas! 50% de desconto em toda a loja. Não percas esta
oportunidade única. Cancelar subscrição.`,
    expect: {
      replyTypes: ['other'],
      forbiddenReplyTypes: ['interest', 'rate_request', 'barter_offer'],
      mustNotInvent: ['brand_name', 'cash_amount_cents'],
      acceptableActions: [],
    },
  },
];

/** Campos que, quando o caso diz que não podem ser inventados, têm de vir
 *  vazios. O mapa existe porque o nome no fixture é legível e o nome no schema
 *  é o que o modelo devolve. */
export const FIELD_PATHS: Record<string, string> = {
  usage_period: 'usage_period',
  cash_amount_cents: 'cash_amount_cents',
  barter_value_cents: 'barter_value_cents',
  deadline: 'deadline',
  brand_name: 'brand_name',
};
