/** Verificar um endereço antes de enviar.
 *
 *  Não é um serviço pago: é o registro MX do domínio, que é público e não custa
 *  nada. Apanha a causa mais comum de devolução — o domínio não recebe email de
 *  todo — e é a diferença entre «por confirmar» e uma resposta.
 *
 *  Não prova que a caixa existe. Isso só um serviço de verificação faz, e para
 *  cinco a dez abordagens por dia não compensa assinar um. O que isto faz é
 *  eliminar o erro barato.
 *
 *  A parte de decidir é pura, para se poder testar sem rede. */

export type Confidence = 'verified' | 'high' | 'medium' | 'low' | 'unknown';

export type CheckInput = {
  email: string;
  /** Se o endereço foi visto na própria marca, ou deduzido pelo modelo. */
  source: 'website' | 'research' | 'guess' | null;
  /** true tem MX, false não tem, null não deu para verificar. */
  domainHasMx: boolean | null;
};

export type CheckResult = {
  valid: boolean;
  confidence: Confidence;
  reason: string;
  /** `info@`, `geral@`: válidos, mas é a porta da frente e não uma pessoa. */
  roleAccount: boolean;
};

/** Prático, não a RFC: um `@`, algo dos dois lados, um ponto no domínio, e
 *  nenhum espaço. A RFC completa aceita coisas que nenhum servidor real usa. */
const SHAPE = /^[^\s@,;:<>()[\]\\"]+@[^\s@.]+(\.[^\s@.]+)+$/;

const ROLE = new Set([
  'info', 'geral', 'general', 'contact', 'contato', 'contato', 'hello', 'ola', 'olá',
  'support', 'suporte', 'admin', 'office', 'mail', 'email', 'sales', 'comercial',
  'noreply', 'no-reply', 'nao-responda',
]);

/** Caixas que nunca respondem. Enviar para aqui é falar com uma parede. */
const NEVER_REPLIES = new Set(['noreply', 'no-reply', 'nao-responda', 'donotreply']);

export function localPart(email: string): string {
  return email.split('@')[0]?.toLowerCase().trim() ?? '';
}

export function domainOf(email: string): string | null {
  const d = email.split('@')[1]?.toLowerCase().trim();
  return d && d.includes('.') ? d : null;
}

export function classify(input: CheckInput): CheckResult {
  const email = input.email.trim();
  const local = localPart(email);
  const roleAccount = ROLE.has(local);

  if (!SHAPE.test(email)) {
    return { valid: false, confidence: 'low', reason: 'O endereço não tem forma de email.', roleAccount };
  }

  if (NEVER_REPLIES.has(local)) {
    return {
      valid: false,
      confidence: 'low',
      reason: 'É uma caixa que não recebe respostas.',
      roleAccount: true,
    };
  }

  if (input.domainHasMx === false) {
    return {
      valid: false,
      confidence: 'low',
      reason: 'O domínio não tem servidor de email: uma mensagem para aqui é devolvida.',
      roleAccount,
    };
  }

  if (input.domainHasMx === null) {
    return {
      valid: true,
      confidence: 'unknown',
      reason: 'Não consegui verificar o domínio.',
      roleAccount,
    };
  }

  // Daqui para baixo o domínio recebe email. O que separa os níveis é de onde
  // veio o endereço — porque o MX diz que o domínio existe, não que a caixa.
  if (input.source === 'website') {
    return {
      valid: true,
      confidence: 'high',
      reason: roleAccount
        ? 'Encontrado no site da marca. É um endereço geral, não uma pessoa.'
        : 'Encontrado no site da marca e o domínio recebe email.',
      roleAccount,
    };
  }

  if (input.source === 'research') {
    return { valid: true, confidence: 'medium', reason: 'Encontrado na pesquisa e o domínio recebe email.', roleAccount };
  }

  return {
    valid: true,
    confidence: 'low',
    reason: 'O domínio recebe email, mas o endereço foi deduzido. Vale a pena confirmar.',
    roleAccount,
  };
}

/* ── A caixa certa ────────────────────────────────────────────────────────── */

/** Um endereço pode existir, receber email, e ainda assim ser o errado.
 *
 *  A Shopkit tem o email de marketing na primeira página do Google e a
 *  abordagem saiu para `suporte@`. Nada aqui distinguia as duas coisas: a
 *  verificação olhava para a forma e para o MX, e `suporte@` passa nos dois.
 *  Uma proposta de parceria numa caixa de suporte é um ticket, e um ticket
 *  fecha-se — não se responde.
 *
 *  Quem decide é o código e não o modelo. Pedir «encontra o email de
 *  marketing» é uma instrução; isto é um portão, e a diferença entre as duas
 *  já custou esta manhã. */
export type MailboxFit = 'target' | 'front_door' | 'wrong_team' | 'never';

/** As caixas de quem decide uma parceria. */
const TARGET = [
  'marketing', 'mkt', 'parcerias', 'parceria', 'partnership', 'partnerships', 'partners',
  'colabs', 'colab', 'collab', 'collabs', 'creators', 'creator', 'influencer', 'influencers',
  'ugc', 'imprensa', 'press', 'pr', 'comunicacao', 'comunicação', 'midia', 'media',
  'brand', 'marca', 'social', 'digital', 'growth',
];

/** A porta da frente: alguém lê, mas ninguém decide. Serve quando não há melhor. */
const FRONT_DOOR = [
  'info', 'geral', 'general', 'contact', 'contacto', 'contato', 'hello', 'ola', 'olá',
  'mail', 'email', 'office', 'comercial', 'sales', 'vendas', 'business', 'contactos',
];

/** Outro departamento. Não é que não respondam — é que respondem outra coisa. */
const WRONG_TEAM = [
  'suporte', 'support', 'ajuda', 'help', 'helpdesk', 'sac', 'apoio', 'atendimento',
  'faturacao', 'faturação', 'faturamento', 'billing', 'financeiro', 'contabilidade',
  'rh', 'hr', 'jobs', 'careers', 'recrutamento', 'emprego',
  'dev', 'tech', 'ti', 'sistemas', 'webmaster', 'hosting',
  'legal', 'juridico', 'jurídico', 'dpo', 'privacidade', 'privacy', 'rgpd', 'gdpr',
  'encomendas', 'devolucoes', 'devoluções', 'logistica', 'logística', 'compras',
  'abuse', 'postmaster', 'security',
];

const semAcento = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Compara sem acentos e sem separadores: `marketing.pt`, `marketing-eu` e
 *  `mkt_geral` são todos a caixa de marketing. */
const contem = (local: string, lista: readonly string[]) => {
  const pedacos = semAcento(local).split(/[^a-z0-9]+/).filter(Boolean);
  return lista.some((alvo) => pedacos.includes(semAcento(alvo)));
};

export function mailboxFit(email: string): MailboxFit {
  const local = localPart(email);
  if (!local) return 'never';
  if (NEVER_REPLIES.has(local)) return 'never';
  if (contem(local, TARGET)) return 'target';
  if (contem(local, WRONG_TEAM)) return 'wrong_team';
  if (contem(local, FRONT_DOOR)) return 'front_door';
  // `joana.silva@`, `jbachur@`: uma pessoa. Vale mais do que a porta da frente
  // e menos do que a caixa de quem trata disto — pode ser qualquer pessoa da
  // empresa, e não se sabe qual.
  return 'front_door';
}

export const MAILBOX_FIT_NOTE: Record<MailboxFit, string> = {
  target: 'é a caixa de quem trata de parcerias',
  front_door: 'é a porta da frente da empresa, não a equipe de marketing',
  wrong_team: 'é de outro departamento: uma proposta aqui vira ticket',
  never: 'é uma caixa que não recebe respostas',
};

export type EmailCandidate = {
  address: string;
  /** O que a marca diz que aquela caixa é, quando a página o diz. */
  team?: string | null;
  source?: 'website' | 'research' | 'guess' | null;
};

/** Um nome de pessoa vale mais do que `info@` — mas menos do que `marketing@`,
 *  porque uma pessoa qualquer não é a pessoa certa. */
const temNomeDePessoa = (email: string) => /^[a-z]+[._-][a-z]+$/.test(semAcento(localPart(email)));

const PESO_FIT: Record<MailboxFit, number> = { target: 100, front_door: 40, wrong_team: 5, never: 0 };
const PESO_FONTE = { website: 12, research: 8, guess: 0 } as const;

/** Qual destes endereços se usa para abordar a marca.
 *
 *  Devolve o escolhido e os outros por ordem, porque a tela mostra-lhe as
 *  alternativas: quando o palpite sai ao lado, trocar tem de ser um toque e não
 *  uma pesquisa no Google outra vez. */
export function pickOutreachEmail(candidates: readonly EmailCandidate[]): {
  chosen: EmailCandidate | null;
  fit: MailboxFit;
  alternatives: EmailCandidate[];
  because: string;
} {
  const validos = candidates.filter((c) => SHAPE.test((c.address ?? '').trim()));
  if (validos.length === 0) {
    return { chosen: null, fit: 'never', alternatives: [], because: 'Nenhum endereço utilizável.' };
  }

  const nota = (c: EmailCandidate) => {
    const fit = mailboxFit(c.address);
    let n = PESO_FIT[fit];
    // O que a própria página diz sobre a caixa desempata: uma marca que
    // escreve «parcerias» ao lado de um endereço sabe melhor do que o padrão.
    if (c.team && /marketing|parceri|partner|colab|collab|creator|influenc|imprensa|press|comunica/i.test(c.team)) {
      n += 30;
    }
    n += PESO_FONTE[c.source ?? 'guess'] ?? 0;
    if (fit !== 'target' && temNomeDePessoa(c.address)) n += 15;
    return n;
  };

  const ordenados = [...validos].sort((a, b) => nota(b) - nota(a));
  const chosen = ordenados[0];
  const fit = mailboxFit(chosen.address);

  return {
    chosen,
    fit,
    alternatives: ordenados.slice(1),
    because:
      fit === 'target'
        ? `${chosen.address} ${MAILBOX_FIT_NOTE.target}.`
        : `Só encontrei ${chosen.address}, que ${MAILBOX_FIT_NOTE[fit]}.`,
  };
}

/** O que a pesquisa devolveu, já decidido.
 *
 *  Existe aqui e não em cada chamador porque são dois — a busca automática e a
 *  manual — e uma regra escrita duas vezes é uma regra que se esquece de um
 *  lado. `where` é a página onde o endereço foi visto: vista no site vale mais
 *  do que vista noutro lado qualquer. */
export function chooseFromResearch(
  contact: { emails?: readonly { address: string; team?: string | null; where?: string | null }[] } | null,
): ReturnType<typeof pickOutreachEmail> {
  const vistos = contact?.emails ?? [];
  return pickOutreachEmail(
    vistos.map((e) => ({
      address: e.address,
      team: e.team ?? null,
      source: /site|website|página|pagina|homepage|contactos|contatos/i.test(e.where ?? '')
        ? ('website' as const)
        : ('research' as const),
    })),
  );
}
