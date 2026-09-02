/** Quem está à espera de quem.
 *
 *  O bug conceptual que este módulo existe para matar: classificar a intenção
 *  de uma conversa olhando para a última mensagem salva. Quando a última é
 *  dela, essa leitura diz que a Carol «pediu portfólio» — e a etiqueta
 *  PEDE PORTFÓLIO aparece em três marcas que nunca pediram nada.
 *
 *  Uma conversa tem três relógios, não um:
 *
 *    última mensagem            qualquer uma das duas partes
 *    última mensagem externa    o que a MARCA disse, que é o que se classifica
 *    última mensagem da Carol   o que ela já respondeu
 *
 *  E uma pergunta que nenhum deles responde sozinho: de quem é a vez.
 *
 *  Puro de propósito. Sem Supabase, sem SDK, sem relógio implícito. */

export type Direction = 'inbound' | 'outbound';

export type ThreadMessage = {
  id: string;
  direction: Direction;
  sentAt: string;
  fromAddress?: string;
  fromName?: string;
  subject?: string;
  bodyText?: string;
};

export type WaitingOn = 'carol' | 'brand' | 'nobody';

export type ThreadState = {
  /** A última que a marca escreveu. É esta que se classifica — nunca a outra. */
  lastExternal: ThreadMessage | null;
  lastCarol: ThreadMessage | null;
  /** A última de todas, seja de quem for. Serve para datas, não para intenção. */
  last: ThreadMessage | null;
  waitingOn: WaitingOn;
  /** Desde quando a bola está do lado de quem está. */
  waitingSince: string | null;
  /** Há quantos dias. Nulo quando não há espera nenhuma. */
  waitingDays: number | null;
  /** Quantas mensagens de cada lado. Uma conversa só com saídas dela nunca é
   *  uma negociação, por muito longa que seja. */
  inboundCount: number;
  outboundCount: number;
};

const ms = (v: string) => {
  const t = Date.parse(v);
  return Number.isNaN(t) ? 0 : t;
};

/** As mensagens podem vir por qualquer ordem: ordena-se aqui, uma vez. */
export function readThreadState(
  messages: readonly ThreadMessage[],
  now: Date = new Date(),
): ThreadState {
  const ordered = [...messages].sort((a, b) => ms(a.sentAt) - ms(b.sentAt));

  const lastExternal = [...ordered].reverse().find((m) => m.direction === 'inbound') ?? null;
  const lastCarol = [...ordered].reverse().find((m) => m.direction === 'outbound') ?? null;
  const last = ordered[ordered.length - 1] ?? null;

  const inboundCount = ordered.filter((m) => m.direction === 'inbound').length;
  const outboundCount = ordered.length - inboundCount;

  // A vez é de quem ainda não respondeu à última do outro. Sem mensagens
  // nenhumas ninguém espera por ninguém — e é isso que impede uma conversa
  // vazia de virar tarefa.
  let waitingOn: WaitingOn = 'nobody';
  let waitingSince: string | null = null;

  if (last) {
    if (last.direction === 'inbound') {
      waitingOn = 'carol';
      waitingSince = last.sentAt;
    } else if (lastExternal) {
      waitingOn = 'brand';
      waitingSince = last.sentAt;
    } else {
      // Ela abordou e a marca nunca respondeu. A bola é da marca na mesma, e a
      // contagem começa na abordagem: é isso que o follow-up mede.
      waitingOn = 'brand';
      waitingSince = last.sentAt;
    }
  }

  const waitingDays =
    waitingSince === null
      ? null
      : Math.max(0, Math.floor((now.getTime() - ms(waitingSince)) / 86_400_000));

  return { lastExternal, lastCarol, last, waitingOn, waitingSince, waitingDays, inboundCount, outboundCount };
}

/* ── Taxonomia de intenção ────────────────────────────────────────────────── */

/** O que a MARCA está fazendo nesta conversa.
 *
 *  A lista é longa porque a diferença entre `BARTER_OFFER` e `PAID_COLLAB`
 *  muda a resposta inteira, e porque `INFLUENCER_REQUEST` — que a Carol recusa
 *  — não é `CREATOR_REQUEST`, que ela aceita. Colapsá-las em «proposta» era
 *  atirar fora a única informação que decide o que dizer a seguir. */
export const THREAD_INTENTS = [
  'NEW_INTEREST',
  'PORTFOLIO_REQUEST',
  'RATE_REQUEST',
  'SCOPE_REQUEST',
  'PAID_COLLAB',
  'BARTER_OFFER',
  'HYBRID_OFFER',
  'AFFILIATE_ONLY',
  'INFLUENCER_REQUEST',
  'CREATOR_REQUEST',
  'USAGE_RIGHTS',
  'WHITELISTING',
  'EXCLUSIVITY',
  'RAW_FOOTAGE',
  'CALL_REQUEST',
  'BRIEF_RECEIVED',
  'PRODUCT_SHIPPED',
  'PRODUCT_RECEIVED',
  'REVISION',
  'APPROVED',
  'PAYMENT',
  'INVOICE',
  'REJECTION',
  'NOT_NOW',
  'FOLLOW_UP_PROMISE',
  'REFERRAL',
  'GENERAL_REPLY',
  'NON_COMMERCIAL',
  'UNCERTAIN',
] as const;

export type ThreadIntent = (typeof THREAD_INTENTS)[number];

export const isThreadIntent = (v: string): v is ThreadIntent =>
  (THREAD_INTENTS as readonly string[]).includes(v);

/** O que ela lê. Nunca a constante em maiúsculas. */
export const INTENT_LABEL: Record<ThreadIntent, string> = {
  NEW_INTEREST: 'interesse novo',
  PORTFOLIO_REQUEST: 'pediu portfólio',
  RATE_REQUEST: 'pediu preço',
  SCOPE_REQUEST: 'quer entender o âmbito',
  PAID_COLLAB: 'proposta paga',
  BARTER_OFFER: 'proposta de permuta',
  HYBRID_OFFER: 'permuta com dinheiro',
  AFFILIATE_ONLY: 'só afiliação',
  INFLUENCER_REQUEST: 'quer influencer, não UGC',
  CREATOR_REQUEST: 'quer creator para conteúdo',
  USAGE_RIGHTS: 'quer direitos de uso',
  WHITELISTING: 'quer whitelisting',
  EXCLUSIVITY: 'quer exclusividade',
  RAW_FOOTAGE: 'quer os arquivos em bruto',
  CALL_REQUEST: 'quer uma chamada',
  BRIEF_RECEIVED: 'mandou o briefing',
  PRODUCT_SHIPPED: 'produto a caminho',
  PRODUCT_RECEIVED: 'produto entregue',
  REVISION: 'pediu alterações',
  APPROVED: 'aprovou',
  PAYMENT: 'assunto de pagamento',
  INVOICE: 'pediu fatura',
  REJECTION: 'disse que não',
  NOT_NOW: 'fica para depois',
  FOLLOW_UP_PROMISE: 'prometeu voltar',
  REFERRAL: 'indicou outra pessoa',
  GENERAL_REPLY: 'respondeu',
  NON_COMMERCIAL: 'não é comercial',
  UNCERTAIN: 'por entender',
};

/** Intenções que a Carol tem de ver hoje, mesmo que o prazo diga o contrário.
 *  Dinheiro, direitos e prazos não esperam pela cadência. */
export const URGENT_INTENTS: ReadonlySet<ThreadIntent> = new Set<ThreadIntent>([
  'PAID_COLLAB',
  'RATE_REQUEST',
  'USAGE_RIGHTS',
  'WHITELISTING',
  'EXCLUSIVITY',
  'RAW_FOOTAGE',
  'PAYMENT',
  'INVOICE',
  'BRIEF_RECEIVED',
  'REVISION',
  'CALL_REQUEST',
]);

/** Intenções que fecham a conversa: não pedem resposta, e insistir estraga. */
export const CLOSED_INTENTS: ReadonlySet<ThreadIntent> = new Set<ThreadIntent>([
  'REJECTION',
  'NON_COMMERCIAL',
]);

/** Palpite determinístico, para quando não há modelo.
 *
 *  Não substitui a classificação: é o chão. Sem chave de IA a Inbox continua a
 *  dizer alguma coisa verdadeira em vez de dizer «por entender» a tudo — e o
 *  que ela diz sai de palavras que estão mesmo lá, não de adivinhação.
 *
 *  Só olha para a última mensagem EXTERNA. É o ponto todo deste módulo. */
export function guessIntent(state: ThreadState): { intent: ThreadIntent; confidence: number } {
  const m = state.lastExternal;
  if (!m) return { intent: 'UNCERTAIN', confidence: 0 };

  const text = `${m.subject ?? ''} ${m.bodyText ?? ''}`.toLowerCase();
  if (!text.trim()) return { intent: 'UNCERTAIN', confidence: 0 };

  // Ordem importa: a primeira que casa ganha, e as caras vêm antes das vagas.
  const rules: [ThreadIntent, RegExp][] = [
    ['INVOICE', /\b(fatura|factura|invoice|recibo|nif|dados de faturaç)/],
    ['PAYMENT', /\b(pagamento|pagar|transfer[iê]ncia|iban|payment|paid|remessa)/],
    ['WHITELISTING', /\b(whitelist|whitelisting|spark ?ads|c[óo]digo de autoriza)/],
    ['EXCLUSIVITY', /\b(exclusivid|exclusive|exclusivity|n[ãa]o poder[áa] trabalhar com)/],
    ['RAW_FOOTAGE', /\b(raw|arquivos em bruto|arquivos brutos|footage|material em bruto)/],
    ['USAGE_RIGHTS', /\b(direitos de uso|usage rights|an[úu]ncios pagos|paid ads|impulsionar|boost)/],
    ['REVISION', /\b(altera[çc]|revis[ãa]o|revision|ajuste|mudar o v[íi]deo|refazer)/],
    ['APPROVED', /\b(aprovad|approved|est[áa] [óo]tim|adorámos|adoramos|pode publicar)/],
    ['BRIEF_RECEIVED', /\b(briefing|brief em anexo|guidelines|documento com as diretrizes)/],
    ['PRODUCT_SHIPPED', /\b(enviad[oa] hoje|a caminho|tracking|c[óo]digo de rastreio|expedid)/],
    ['PRODUCT_RECEIVED', /\b(j[áa] recebeu|chegou o produto|entregue)/],
    // «budget» sozinho não é um pedido de preço: «temos budget disponível» é
    // uma oferta, e era assim que uma proposta paga aparecia como pedido de
    // tabela. Fica o que só aparece quando alguém pergunta.
    ['RATE_REQUEST', /\b(tabela de pre[çc]|or[çc]amento|quanto (cobra|custa)|rate card|pricing|valores para)/],
    ['PORTFOLIO_REQUEST', /\b(portef[óo]lio|portf[óo]lio|portfolio|exemplos de trabalhos|media ?kit)/],
    ['CALL_REQUEST', /\b(call|reuni[ãa]o|videochamada|meet|agendar uma conversa)/],
    ['AFFILIATE_ONLY', /\b(afilia|comiss[ãa]o por venda|affiliate|c[óo]digo de desconto[^.]*comiss)/],
    ['BARTER_OFFER', /\b(permuta|em troca do produto|oferecemos o produto|barter|sem cach[êe])/],
    ['INFLUENCER_REQUEST', /\b(publicar no teu perfil|no seu perfil|no teu instagram|influencer|divulgar para a tua audi[êe]ncia)/],
    ['REJECTION', /\b(n[ãa]o vamos avan[çc]ar|sem interesse|declinar|not interested|infelizmente n[ãa]o)/],
    ['NOT_NOW', /\b(mais para a frente|no pr[óo]ximo trimestre|para o ano|de momento n[ãa]o|voltamos)/],
    ['FOLLOW_UP_PROMISE', /\b(dou (\-)?lhe not[íi]cias|volto a contactar|entramos em contacto|dou retorno)/],
    ['REFERRAL', /\b(fal(e|a) com a?o? |encaminhei|coloco em c[óo]pia|reencaminho para)/],
    ['SCOPE_REQUEST', /\b(quantos v[íi]deos|que formato|dura[çc][ãa]o|o que inclui|deliverables)/],
    ['PAID_COLLAB', /\b(colabora[çc][ãa]o paga|cach[êe]|budget dispon[íi]vel|proposta de colabora)/],
    ['CREATOR_REQUEST', /\b(ugc|conte[úu]do para (os )?nossos (an[úu]ncios|canais)|creator)/],
    ['NEW_INTEREST', /\b(descobri o teu|vimos o teu|gostar[íi]amos de trabalhar|adorar[íi]amos)/],
  ];

  for (const [intent, re] of rules) {
    if (re.test(text)) return { intent, confidence: 0.55 };
  }
  return { intent: 'GENERAL_REPLY', confidence: 0.3 };
}

/** A frase de topo do cartão: quem escreveu e há quanto tempo espera.
 *
 *  Determinística — não depende de haver modelo. Sem sujeito, como o resto da
 *  interface: escolher entre «tu» e «si» é uma decisão que nenhuma das duas
 *  hipóteses ganha, e nota-se sempre que as duas aparecem na mesma tela. */
export function waitingLine(state: ThreadState, brandName: string): string {
  if (state.waitingOn === 'carol') {
    const who = state.lastExternal?.fromName?.split(' ')[0] || brandName;
    if (state.waitingDays === null || state.waitingDays === 0) return `${who} escreveu hoje.`;
    if (state.waitingDays === 1) return `${who} escreveu ontem e está à espera.`;
    return `${who} está à espera há ${state.waitingDays} dias.`;
  }
  if (state.waitingOn === 'brand') {
    if (state.inboundCount === 0) {
      return state.waitingDays && state.waitingDays > 0
        ? `Abordada há ${state.waitingDays} dias, ainda sem resposta.`
        : 'Abordada hoje.';
    }
    return state.waitingDays && state.waitingDays > 0
      ? `Respondida há ${state.waitingDays} dias. A ${brandName} ainda não voltou.`
      : `Já respondida. Agora a vez é da ${brandName}.`;
  }
  return 'Sem mensagens nesta conversa.';
}
