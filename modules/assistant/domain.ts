/** Regras puras do Carol AI. Sem base de dados, sem rede, sem `server-only`:
 *  é isto que se testa. */

export type Gate = 'business_relevant' | 'business_adjacent' | 'off_topic' | 'uncertain';

export type EntityContext =
  | { type: 'brand' | 'opportunity' | 'document' | 'collaboration' | 'content'; id: string }
  | { type: 'today' | 'inbox' | 'other'; id: null };

export type Source = {
  id: string;
  type: 'brand' | 'opportunity' | 'email' | 'document' | 'pricing' | 'portfolio' | 'memory' | 'knowledge' | 'followup' | 'case';
  label: string;
  at: string | null;
  href: string | null;
};

/* ── Porta de domínio ────────────────────────────────────────────────────── */

/** O Carol AI existe para o negócio dela. O system prompt pede isso, mas um
 *  prompt não é uma fronteira: pede-se educadamente e o modelo às vezes cede.
 *  Isto corre antes, e o que for claramente de fora nunca chega a gastar
 *  ferramentas nem um modelo caro. */

const BUSINESS = [
  'marca', 'marcas', 'brand', 'campanha', 'ugc', 'conteudo', 'video', 'reel', 'criativo',
  'proposta', 'orcamento', 'preco', 'precos', 'valor', 'cobrar', 'cobranca', 'fatura',
  'faturacao', 'pagamento', 'receber', 'contrato', 'direitos', 'licenca', 'usage',
  'permuta', 'barter', 'briefing', 'brief', 'guiao', 'roteiro', 'entrega', 'deliverable',
  'oportunidade', 'negociacao', 'follow', 'followup', 'email', 'inbox', 'gmail', 'cliente',
  'clientes', 'contacto', 'portfolio', 'case', 'metrica', 'metricas', 'performance',
  'anuncio', 'anuncios', 'ads', 'instagram', 'tiktok', 'colaboracao', 'gravar', 'gravacao',
  'producao', 'shot', 'upsell', 'retainer', 'nicho', 'saas', 'app', 'tech', 'pet',
  'exclusividade', 'whitelisting', 'perpetuidade', 'carolos', 'negocio', 'trabalho',
  // Os verbos com que ela fala do trabalho. Sem isto, «o que respondo à X?» —
  // que é literalmente a pergunta mais frequente — não era reconhecida.
  'responder', 'respondo', 'resposta', 'escrever', 'escrevo', 'mandar', 'mando',
  'enviar', 'envio', 'dizer', 'digo', 'sabemos', 'sei', 'aceito', 'aceitar',
  'recusar', 'fechar', 'fecho', 'propor', 'proposta', 'insistir', 'pedir',
];

/** Coisas que só são do negócio com contexto. «Que tripé compro?» é trabalho
 *  se for para gravar; «que carro compro?» não é. */
const ADJACENT = [
  'tripe', 'camera', 'lente', 'microfone', 'iluminacao', 'ring', 'luz', 'iphone',
  'equipamento', 'software', 'ferramenta', 'app', 'viagem', 'viajar', 'lisboa', 'porto',
  'impostos', 'irs', 'recibo', 'freelance', 'produtividade', 'organizar', 'agenda',
];

const OFF_TOPIC = [
  'futebol', 'champions', 'benfica', 'sporting', 'cozinhar', 'receita',
  'politica', 'eleicoes', 'presidente', 'namorado', 'namorada', 'mae', 'pai',
  'horoscopo', 'netflix', 'piada', 'anedota', 'guerra', 'religiao',
];

/** Sem acentos e sem pontuação: «direitos» e «direıtos» procuram igual, e a
 *  comparação por palavra inteira evita que «api» case dentro de «rápida». */
export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Plural simples e formas próximas: sem isto «vídeos» não encontrava «video»
 *  e «cobro» não encontrava «cobrar», que é meia lista a falhar em português. */
const singular = (w: string) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w);

const STEM: Record<string, string> = {
  cobro: 'cobrar', cobras: 'cobrar', cobrei: 'cobrar', cobramos: 'cobrar',
  precos: 'preco', valores: 'valor', marca: 'marcas', clientes: 'cliente',
  gravo: 'gravar', gravei: 'gravar', entrego: 'entrega', entreguei: 'entrega',
};

const hits = (words: string[], list: string[]) => {
  const bag = new Set<string>();
  for (const w of words) {
    bag.add(w);
    bag.add(singular(w));
    if (STEM[w]) bag.add(STEM[w]);
  }
  return list.filter((w) => bag.has(w) || bag.has(singular(w))).length;
};

export function classifyDomain(
  message: string,
  context?: { hasEntity?: boolean; priorTurns?: number },
): Gate {
  const words = tokens(message);
  if (words.length === 0) return 'uncertain';

  const off = hits(words, OFF_TOPIC);
  const business = hits(words, BUSINESS);
  const adjacent = hits(words, ADJACENT);

  // Fora de tema explícito ganha, mas só quando nada do negócio o acompanha:
  // «que música ponho no reel» tem «musica» e «reel», e é trabalho.
  if (off > 0 && business === 0) return 'off_topic';
  if (business > 0) return 'business_relevant';
  if (adjacent > 0) return 'business_adjacent';

  // Já dentro de uma marca, ou a meio de uma conversa, «e agora?» é do negócio.
  if (context?.hasEntity || (context?.priorTurns ?? 0) > 0) return 'business_relevant';

  return 'uncertain';
}

export const shouldUseTools = (gate: Gate) => gate !== 'off_topic';

export const OFF_TOPIC_REPLY =
  'Eu fico focada no teu negócio de UGC e no CarolOS. Se isso tiver alguma ligação com trabalho, conta-me o contexto que eu ajudo.';

/* ── Janela de contexto ──────────────────────────────────────────────────── */

export type Turn = { role: 'user' | 'assistant'; content: string; id: string };

/** Mandar a conversa toda a cada mensagem é pagar duas vezes pelo mesmo texto.
 *  Guarda-se tudo, envia-se o fim — e o princípio vai como resumo. */
export function windowTurns(turns: readonly Turn[], keep = 12): {
  recent: Turn[];
  needsSummary: boolean;
  summariseThrough: string | null;
} {
  if (turns.length <= keep) return { recent: [...turns], needsSummary: false, summariseThrough: null };
  const cut = turns.length - keep;
  return {
    recent: turns.slice(cut),
    needsSummary: true,
    summariseThrough: turns[cut - 1]?.id ?? null,
  };
}

/* ── Promoção a memória ──────────────────────────────────────────────────── */

export type MemoryCandidate = {
  type: 'preference' | 'policy' | 'pricing_decision' | 'brand_preference' | 'goal' | 'constraint';
  content: string;
  /** Uma regra comercial nunca muda em silêncio: fica proposta à espera dela. */
  needsConfirmation: boolean;
};

const PRICE = /(?:€|eur\b|euros?\b)\s?\d|(\d+\s?(?:€|eur\b|euros?\b))/i;

/** «Estou cansada» não é uma regra do negócio. «Não trabalho com skincare» é.
 *  E «o meu mínimo agora é 180€» é crítico o suficiente para não passar sem
 *  alguém dizer que sim. */
export function memoryCandidate(message: string): MemoryCandidate | null {
  const t = message.trim();
  if (t.length < 8) return null;
  const words = tokens(t);

  const refuses = ['nao', 'nunca', 'deixei', 'recuso', 'evitar', 'evito'].some((w) => words.includes(w));
  const wants = ['quero', 'prefiro', 'gosto', 'objetivo', 'meta', 'foco'].some((w) => words.includes(w));

  if (PRICE.test(t) && (words.includes('minimo') || words.includes('cobro') || words.includes('preco') || words.includes('valor'))) {
    return { type: 'pricing_decision', content: t, needsConfirmation: true };
  }

  const nicheWords = ['skincare', 'haircare', 'suplemento', 'suplementos', 'nicho', 'marcas', 'moda', 'beleza'];
  if ((refuses || wants) && nicheWords.some((w) => words.includes(w))) {
    return { type: 'brand_preference', content: t, needsConfirmation: false };
  }

  if (wants && (words.includes('objetivo') || words.includes('meta'))) {
    return { type: 'goal', content: t, needsConfirmation: false };
  }

  if (refuses || wants) return { type: 'preference', content: t, needsConfirmation: false };

  return null;
}

/* ── Acções sensíveis ────────────────────────────────────────────────────── */

/** Ler não pergunta. Escrever pouco pergunta. Sair para fora, mexer em dinheiro
 *  ou apagar pergunta sempre. */
export const HIGH_RISK = new Set([
  'send_email', 'send_dm', 'set_pricing_policy', 'accept_opportunity', 'update_rights',
  'delete_data', 'update_contract', 'publish_case', 'publish_portfolio', 'send_proposal',
]);

export const needsConfirmation = (tool: string) => HIGH_RISK.has(tool);
