/** Next Best Action: de «o que a marca disse» a «o que sai daqui a seguir».
 *
 *  O que este módulo mata: três motores com três opiniões. O planeador dizia
 *  «Responder à mensagem», a triagem dizia «encaminhar para o marketing», e a
 *  manhã lia um dos dois conforme calhava. A Cora escreveu, por extenso, «envie
 *  a sua apresentação para marketing@cora.com.br» — e a ação preparada era
 *  uma resposta à pessoa errada, na thread errada.
 *
 *  Aqui a próxima ação de uma conversa é calculada por UMA função, a partir da
 *  leitura da triagem e do que está escrito na mensagem. O Hoje, a Inbox e a
 *  Marca leem a mesma coisa; um `action_item` é uma projeção, nunca uma
 *  segunda opinião.
 *
 *  Um endereço só conta se estiver mesmo na mensagem: o modelo pode dizer que
 *  houve encaminhamento, mas o email que sai vai para o que o texto contém —
 *  nunca para o que o modelo achou que devia estar lá.
 *
 *  Puro. */

import { CLOSED_INTENTS, type ThreadIntent, type WaitingOn } from '@/modules/email/thread-state';
import { ACTION_CTA, type ActionType } from './planner';

/* ── Contrato ─────────────────────────────────────────────────────────────── */

export type ReferredContact = {
  email: string;
  /** A frase onde o endereço apareceu. É a prova que a tela mostra. */
  context: string;
  /** «marketing», «parcerias»… quando a própria mensagem o diz. */
  team: string | null;
  valid: boolean;
  /** Porque não serve, quando não serve. */
  reason: string | null;
};

export type NextActionTarget = {
  kind: 'reply' | 'compose' | 'open' | 'none';
  to: string | null;
  threadId: string | null;
  href: string | null;
};

export type PreparedArtifact = {
  subject: string;
  body: string;
  language: string;
  /** Quem escreveu: o modelo, ou a regra determinística. A tela só põe o selo
   *  da CarolAI quando foi o modelo. */
  source: 'model' | 'rule';
};

export type NextAction = {
  type: ActionType;
  title: string;
  reason: string;
  cta: string;
  evidence: {
    sourceThreadId: string | null;
    sourceMessageId: string | null;
    /** O trecho da mensagem que justifica a ação. */
    quote: string | null;
    because: string;
  };
  confidence: number;
  target: NextActionTarget;
  preparedArtifact: PreparedArtifact | null;
  /** Sai para fora: nunca sem o sim dela. */
  requiresConfirmation: boolean;
  /** A pergunta curta, quando o sistema não pode decidir sozinho. */
  needsDecision: string | null;
  candidates: ReferredContact[];
  opportunityId: string | null;
  brandId: string | null;
  contactId: string | null;
  dueAt: string | null;
};

/** O que fica à espera de uma pessoa. O resto é estado, não trabalho. */
export const isActionable = (a: Pick<NextAction, 'type'> | null | undefined): boolean =>
  Boolean(a && a.type !== 'no_action_required' && a.type !== 'wait_until_date');

/* ── Endereços indicados na mensagem ──────────────────────────────────────── */

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const VALID = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MACHINE = /(no-?reply|donotreply|do-not-reply|mailer-daemon|notifications?@|newsletter@|bounce)/i;

const TEAM_WORDS: [RegExp, string][] = [
  [/\bmarketing\b/i, 'marketing'],
  [/\bparcerias?\b|\bpartnerships?\b/i, 'parcerias'],
  [/\bcomercial\b|\bsales\b|\bvendas\b/i, 'comercial'],
  [/\binfluenc/i, 'influência'],
  [/\bcomunica[çc][ãa]o\b|\bcommunications?\b|\bimprensa\b|\bpress\b/i, 'comunicação'],
  [/\bcriativ|\bcreative\b/i, 'criativos'],
  [/\bconte[úu]do\b|\bcontent\b/i, 'conteúdo'],
  [/\bsocial\b|\bredes\b/i, 'redes sociais'],
];

const teamNear = (context: string, email: string): string | null => {
  const local = email.split('@')[0];
  for (const [re, label] of TEAM_WORDS) {
    if (re.test(local) || re.test(context)) return label;
  }
  return null;
};

/** A frase à volta do endereço, sem quebras, até 200 caracteres. */
function sentenceAround(text: string, index: number, length: number): string {
  const inicio = Math.max(0, text.lastIndexOf('\n', index) + 1);
  const fimLinha = text.indexOf('\n', index + length);
  const fim = fimLinha === -1 ? text.length : fimLinha;
  const linha = text.slice(inicio, fim).replace(/\s+/g, ' ').trim();
  if (linha.length <= 200) return linha;
  const meio = index - inicio;
  return `…${linha.slice(Math.max(0, meio - 90), meio + 110).trim()}…`;
}

/** Os endereços que a mensagem indica, com a frase onde aparecem.
 *
 *  `exclude` leva o remetente e as caixas da Carol: o email que a marca
 *  assina, ou o dela em cópia, não são um encaminhamento. */
export function extractReferredContacts(
  text: string,
  opts: { exclude?: readonly string[] } = {},
): ReferredContact[] {
  const fora = new Set((opts.exclude ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean));
  const vistos = new Set<string>();
  const out: ReferredContact[] = [];

  for (const m of text.matchAll(EMAIL)) {
    const email = m[0].toLowerCase().replace(/[.,;:]+$/, '');
    if (vistos.has(email) || fora.has(email)) continue;
    vistos.add(email);

    const context = sentenceAround(text, m.index ?? 0, m[0].length);
    const valid = VALID.test(email) && !MACHINE.test(email);
    out.push({
      email,
      context,
      team: teamNear(context, email),
      valid,
      reason: valid ? null : MACHINE.test(email) ? 'É uma caixa automática, não uma pessoa.' : 'O endereço não parece válido.',
    });
  }
  return out;
}

export type ReferralDecision =
  | { kind: 'compose'; to: ReferredContact }
  | { kind: 'confirm'; question: string; candidates: ReferredContact[] }
  | { kind: 'ask_contact' }
  | { kind: 'none' };

/** Decide se há um encaminhamento e se dá para agir sem perguntar.
 *
 *  Um endereço válido: escreve-se para ele. Dois: pergunta-se qual. Um que
 *  não serve: mostra-se e pergunta-se. Intenção de encaminhar sem endereço
 *  nenhum: pede-se o contato — nunca se inventa um. */
export function decideReferral(input: {
  intent: ThreadIntent;
  referred: readonly ReferredContact[];
}): ReferralDecision {
  const validos = input.referred.filter((r) => r.valid);
  if (validos.length === 1) return { kind: 'compose', to: validos[0] };
  if (validos.length > 1) {
    return {
      kind: 'confirm',
      question: `Encontrei ${validos.length} endereços nesta mensagem: ${validos.map((v) => v.email).join(', ')}. Para qual mando?`,
      candidates: validos,
    };
  }
  if (input.referred.length > 0) {
    const r = input.referred[0];
    return {
      kind: 'confirm',
      question: `A marca deixou ${r.email}, mas ${(r.reason ?? 'não parece um contato').toLowerCase().replace(/\.$/, '')}. Mando mesmo assim?`,
      candidates: [...input.referred],
    };
  }
  if (input.intent === 'REFERRAL') return { kind: 'ask_contact' };
  return { kind: 'none' };
}

/* ── O email para o contato indicado, sem modelo ──────────────────────────── */

const semRe = (s: string) => s.replace(/^\s*(re|fwd?|enc):\s*/i, '').trim();

/** Um nome de pessoa, não uma marca nem uma caixa. */
export const looksLikePersonName = (name: string | null | undefined, brandName: string): boolean => {
  const n = (name ?? '').trim();
  if (!n || n.includes('@')) return false;
  if (n.toLowerCase() === brandName.trim().toLowerCase()) return false;
  if (/\b(equipe|equipa|team|time|suporte|support|atendimento|marketing|parcerias)\b/i.test(n)) return false;
  return /^[\p{L}][\p{L}' -]{1,60}$/u.test(n);
};

/** O chão determinístico: sem modelo, o email continua a sair certo.
 *
 *  Não inventa nome de pessoa. Diz de onde veio o contato, porque isso é o
 *  que faz um email frio deixar de ser frio, e leva o que ela já tinha
 *  escrito à marca — o argumento não muda porque mudou a caixa. */
export function composeReferralTemplate(input: {
  brandName: string;
  team: string | null;
  senderName: string | null;
  originalSubject: string | null;
  originalBody: string | null;
  signature?: string;
}): PreparedArtifact {
  const original = (input.originalBody ?? '').trim();
  // A língua é a da abordagem original: uma marca a quem ela escreveu em
  // inglês recebe o email novo em inglês, não meio a meio.
  const ingles = looksEnglish(original);
  const pessoa = looksLikePersonName(input.senderName, input.brandName) ? input.senderName!.trim().split(' ')[0] : null;
  const assunto = input.originalSubject && semRe(input.originalSubject)
    ? semRe(input.originalSubject)
    : ingles ? `UGC content for ${input.brandName}` : `UGC | Conteúdo para a ${input.brandName}`;

  const corpo = (ingles
    ? [
        `Hi ${input.team ? `${input.team} team` : 'team'}!`,
        '',
        `${pessoa ?? `The ${input.brandName} support team`} pointed me to this address to talk about a UGC content collaboration. Here is what I had already shared with you.`,
        original ? `\n${original}` : '',
        '',
        'Happy to talk whenever works for you.',
        '',
        input.signature ?? 'Carolina',
      ]
    : [
        `Olá, ${input.team ? `equipe de ${input.team}` : 'equipe'}!`,
        '',
        `${pessoa ? `A ${pessoa}` : 'A equipe de atendimento'} da ${input.brandName} me indicou este contato para falar sobre uma colaboração de conteúdo UGC. Deixo abaixo o que já tinha compartilhado com vocês.`,
        original ? `\n${original}` : '',
        '',
        'Fico à disposição para conversar.',
        '',
        input.signature ?? 'Carolina',
      ])
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { subject: assunto, body: corpo, language: ingles ? 'en' : 'pt-BR', source: 'rule' };
}

/** Inglês ou português, pelo que está escrito — sem modelo. */
export function looksEnglish(text: string): boolean {
  const t = ` ${text.toLowerCase()} `;
  if (!t.trim()) return false;
  const en = (t.match(/ (the|and|with|for|you|your|i'm|about|would|content|team|hi|hello|thanks) /g) ?? []).length;
  const pt = (t.match(/ (o|a|os|as|de|do|da|para|com|você|vocês|olá|equipe|obrigad[ao]|conteúdo|uma|um|que|não) /g) ?? []).length;
  return en > pt;
}

/* ── A próxima ação de uma conversa ───────────────────────────────────────── */

export type ThreadReading = {
  threadId: string;
  opportunityId: string | null;
  brandId: string | null;
  brandName: string;
  intent: ThreadIntent;
  confidence: number;
  waitingOn: WaitingOn;
  waitingSince: string | null;
  lastExternal: { id: string; fromAddress: string; fromName: string; bodyText: string; sentAt: string } | null;
  /** O que a triagem escreveu. `target` diz se é resposta na mesma linha ou
   *  email novo para o contato indicado. */
  draft: { subject: string; body: string; language: string; needsReply: boolean; target: 'same_thread' | 'referred_contact' } | null;
  recommendation: string;
  whatTheyWant: string;
  referred: readonly ReferredContact[];
  /** O contato indicado, quando já existe na base. */
  referredContactId?: string | null;
  promisedDate?: string | null;
  /** A abordagem original dela, para o email novo levar o argumento. */
  originalOutbound?: { subject: string; body: string } | null;
};

const REPLY_TYPE: Partial<Record<ThreadIntent, { type: ActionType; title: string }>> = {
  PORTFOLIO_REQUEST: { type: 'send_portfolio', title: 'Enviar o portfólio e o exemplo mais relevante' },
  RATE_REQUEST: { type: 'send_rate', title: 'Responder ao pedido de valor' },
  SCOPE_REQUEST: { type: 'ask_scope', title: 'Clarificar o escopo antes de dar número' },
  USAGE_RIGHTS: { type: 'ask_usage_rights', title: 'Clarificar período e canais do uso' },
  WHITELISTING: { type: 'ask_usage_rights', title: 'Clarificar o whitelisting antes de aceitar' },
  EXCLUSIVITY: { type: 'ask_usage_rights', title: 'Clarificar a exclusividade antes de aceitar' },
  RAW_FOOTAGE: { type: 'ask_usage_rights', title: 'Clarificar o pedido de arquivos em bruto' },
  CALL_REQUEST: { type: 'schedule_call', title: 'Marcar a call e preparar o escopo' },
  BRIEF_RECEIVED: { type: 'acknowledge_brief', title: 'Confirmar o briefing recebido' },
  PRODUCT_SHIPPED: { type: 'confirm_delivery', title: 'Confirmar quando o produto chegar' },
  PRODUCT_RECEIVED: { type: 'respond', title: 'Confirmar que recebeu e alinhar o prazo' },
  REVISION: { type: 'respond', title: 'Responder às alterações pedidas' },
  APPROVED: { type: 'respond', title: 'Agradecer a aprovação e combinar o próximo passo' },
  BARTER_OFFER: { type: 'negotiate', title: 'Avaliar a permuta oferecida' },
  HYBRID_OFFER: { type: 'negotiate', title: 'Avaliar a proposta mista' },
  AFFILIATE_ONLY: { type: 'negotiate', title: 'Reenquadrar: a proposta é UGC, não afiliação' },
  INFLUENCER_REQUEST: { type: 'negotiate', title: 'Reenquadrar: UGC para os canais da marca' },
  PAID_COLLAB: { type: 'respond', title: 'Responder à proposta paga' },
  INVOICE: { type: 'respond', title: 'Responder sobre a fatura' },
  PAYMENT: { type: 'respond', title: 'Responder sobre o pagamento' },
};

const base = (r: ThreadReading) => ({
  opportunityId: r.opportunityId,
  brandId: r.brandId,
  contactId: null as string | null,
  dueAt: null as string | null,
  confidence: r.confidence,
  candidates: [] as ReferredContact[],
  needsDecision: null as string | null,
  preparedArtifact: null as PreparedArtifact | null,
});

const nada = (r: ThreadReading, reason: string): NextAction => ({
  ...base(r),
  type: 'no_action_required',
  title: 'Nada a fazer agora',
  reason,
  cta: ACTION_CTA.no_action_required,
  evidence: { sourceThreadId: r.threadId, sourceMessageId: r.lastExternal?.id ?? null, quote: null, because: reason },
  target: { kind: 'none', to: null, threadId: r.threadId, href: null },
  requiresConfirmation: false,
});

/** A função. Uma só, para todas as telas. */
export function nextActionForThread(r: ThreadReading): NextAction {
  const href = `/dashboard/inbox?thread=${r.threadId}`;

  if (!r.lastExternal) return nada(r, 'A marca ainda não respondeu. A vez é dela.');

  if (CLOSED_INTENTS.has(r.intent)) {
    return nada(r, r.intent === 'REJECTION' ? 'A marca disse que não. Insistir agora estraga.' : 'Esta conversa não é comercial.');
  }

  /* ── Encaminhamento: vale mesmo quando a vez «parece» ser da marca ─────── */
  const referral = decideReferral({ intent: r.intent, referred: r.referred });

  if (referral.kind === 'compose') {
    const quem = looksLikePersonName(r.lastExternal.fromName, r.brandName)
      ? r.lastExternal.fromName.trim().split(' ')[0]
      : `A ${r.brandName}`;
    const equipe = referral.to.team ? ` (${referral.to.team})` : '';
    const artefato =
      r.draft && r.draft.target === 'referred_contact' && r.draft.body.trim().length >= 10
        ? { subject: r.draft.subject || composeReferralTemplate({ brandName: r.brandName, team: referral.to.team, senderName: r.lastExternal.fromName, originalSubject: r.originalOutbound?.subject ?? null, originalBody: null }).subject, body: r.draft.body, language: r.draft.language, source: 'model' as const }
        : composeReferralTemplate({
            brandName: r.brandName,
            team: referral.to.team,
            senderName: r.lastExternal.fromName,
            originalSubject: r.originalOutbound?.subject ?? null,
            originalBody: r.originalOutbound?.body ?? null,
          });

    return {
      ...base(r),
      type: 'compose_to_new_contact',
      title: `Escrever para ${referral.to.email}`,
      reason: `${quem} indicou ${referral.to.email}${equipe} como o contato certo. O email novo já está escrito.`,
      cta: ACTION_CTA.compose_to_new_contact,
      evidence: {
        sourceThreadId: r.threadId,
        sourceMessageId: r.lastExternal.id,
        quote: referral.to.context,
        because: `Esse endereço foi informado pela própria marca nesta mensagem.`,
      },
      target: { kind: 'compose', to: referral.to.email, threadId: r.threadId, href },
      preparedArtifact: artefato,
      requiresConfirmation: true,
      contactId: r.referredContactId ?? null,
    };
  }

  if (referral.kind === 'confirm') {
    return {
      ...base(r),
      type: 'confirm_referral',
      title: 'Confirmar para quem escrever',
      reason: referral.question,
      cta: ACTION_CTA.confirm_referral,
      evidence: {
        sourceThreadId: r.threadId,
        sourceMessageId: r.lastExternal.id,
        quote: referral.candidates[0]?.context ?? null,
        because: 'A mensagem tem mais do que uma leitura possível e nada sai sem você escolher.',
      },
      target: { kind: 'open', to: null, threadId: r.threadId, href },
      requiresConfirmation: false,
      needsDecision: referral.question,
      candidates: referral.candidates,
    };
  }

  if (referral.kind === 'ask_contact') {
    return {
      ...base(r),
      type: 'respond',
      title: 'Pedir o contato certo',
      reason: 'A marca indicou outra pessoa, mas não deixou email nem nome. Vale perguntar.',
      cta: ACTION_CTA.respond,
      evidence: { sourceThreadId: r.threadId, sourceMessageId: r.lastExternal.id, quote: null, because: 'Sem endereço na mensagem, não há para quem escrever.' },
      target: { kind: 'reply', to: r.lastExternal.fromAddress, threadId: r.threadId, href },
      preparedArtifact: r.draft && r.draft.body.trim() ? { subject: r.draft.subject, body: r.draft.body, language: r.draft.language, source: 'model' } : null,
      requiresConfirmation: true,
    };
  }

  /* ── A vez é da marca ──────────────────────────────────────────────────── */
  if (r.waitingOn !== 'carol') {
    if ((r.intent === 'NOT_NOW' || r.intent === 'FOLLOW_UP_PROMISE') && r.promisedDate) {
      return {
        ...nada(r, `A marca prometeu voltar até ${r.promisedDate}. O follow-up marca-se sozinho.`),
        type: 'wait_until_date',
        title: 'À espera da data combinada',
        cta: ACTION_CTA.wait_until_date,
        dueAt: r.promisedDate,
      };
    }
    return nada(r, 'Já respondida. A vez é da marca, e o follow-up marca-se sozinho.');
  }

  /* ── A vez é dela ──────────────────────────────────────────────────────── */
  if (r.draft && !r.draft.needsReply) {
    if ((r.intent === 'NOT_NOW' || r.intent === 'FOLLOW_UP_PROMISE') && r.promisedDate) {
      return {
        ...nada(r, r.recommendation || `A marca prometeu voltar até ${r.promisedDate}.`),
        type: 'wait_until_date',
        title: 'À espera da data combinada',
        cta: ACTION_CTA.wait_until_date,
        dueAt: r.promisedDate,
      };
    }
    return nada(r, r.recommendation || 'Não há nada a responder agora.');
  }

  const mapeado = REPLY_TYPE[r.intent] ?? { type: 'respond' as ActionType, title: r.whatTheyWant ? `Responder: ${r.whatTheyWant}` : 'Responder à mensagem' };
  const artefato: PreparedArtifact | null = r.draft && r.draft.body.trim().length >= 10
    ? { subject: r.draft.subject, body: r.draft.body, language: r.draft.language, source: 'model' }
    : null;

  return {
    ...base(r),
    type: mapeado.type,
    title: mapeado.title,
    reason: r.recommendation || r.whatTheyWant || 'A marca falou por último e está à espera.',
    cta: ACTION_CTA[mapeado.type],
    evidence: {
      sourceThreadId: r.threadId,
      sourceMessageId: r.lastExternal.id,
      quote: null,
      because: r.whatTheyWant || 'A última mensagem é da marca.',
    },
    target: { kind: 'reply', to: r.lastExternal.fromAddress, threadId: r.threadId, href },
    preparedArtifact: artefato,
    requiresConfirmation: true,
  };
}

/** Lê o que está gravado. Uma linha vazia ou de outra versão vale `null` —
 *  o planeador cai no comportamento antigo em vez de rebentar. */
export function readNextAction(value: unknown): NextAction | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.type !== 'string' || typeof v.title !== 'string' || !v.target) return null;
  return v as unknown as NextAction;
}
