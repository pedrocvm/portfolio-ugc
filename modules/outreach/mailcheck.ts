/** Verificar um endereço antes de enviar.
 *
 *  Não é um serviço pago: é o registo MX do domínio, que é público e não custa
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
  'info', 'geral', 'general', 'contact', 'contacto', 'contato', 'hello', 'ola', 'olá',
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
