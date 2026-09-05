/** Erros da Meta, normalizados.
 *
 *  A API devolve `code: 100` para coisas que não têm nada a ver umas com as
 *  outras: métrica não suportada para o tipo de mídia, campo removido, conta
 *  convertida depois da publicação. Tratá-las todas como «falha» derruba um
 *  sync inteiro por causa de uma métrica que aquele Reel nunca teve.
 *
 *  A classificação existe para o sync saber a diferença entre «tenta outra
 *  vez», «pede a métrica sem esse campo» e «pára e avisa a Carol».
 *
 *  Puro. */

export const ERROR_KINDS = [
  'auth_revoked',
  'token_expired',
  'rate_limited',
  'permission_missing',
  'unsupported_metric',
  'not_available',
  'transient',
  'invalid_request',
  'timeout',
  'provider_unknown',
] as const;

export type MetaErrorKind = (typeof ERROR_KINDS)[number];

export type MetaError = {
  kind: MetaErrorKind;
  /** Mensagem já limpa. Nunca contém token, header nem URL assinado. */
  message: string;
  status: number | null;
  code: number | null;
  subcode: number | null;
  /** Métricas que o endpoint recusou, quando dá para as ler da mensagem. */
  unsupportedMetrics: string[];
  retryable: boolean;
  /** Segundos a esperar antes de tentar de novo, quando o erro o sugere. */
  retryAfterSeconds: number | null;
};

export class MetaApiError extends Error {
  readonly detail: MetaError;

  constructor(detail: MetaError) {
    super(detail.message);
    this.name = 'MetaApiError';
    this.detail = detail;
  }
}

type RawMetaError = {
  message?: unknown;
  type?: unknown;
  code?: unknown;
  error_subcode?: unknown;
  error_user_msg?: unknown;
};

const TOKEN_LIKE = /(access_token=|IGAA[\w-]{20,}|EAA[\w-]{20,}|Bearer\s+[\w.-]{20,})/gi;

/** Tira do texto tudo o que pareça credencial antes de o erro sair daqui.
 *
 *  Uma mensagem de erro acaba num log, num `job_run` e às vezes numa tela. Um
 *  token dentro dela é um token vazado em três sítios ao mesmo tempo. */
export function redact(text: string): string {
  return text.replace(TOKEN_LIKE, '[redigido]').slice(0, 500);
}

/** Métricas nomeadas numa mensagem de «does not support».
 *
 *  A Meta escreve «does not support the profile_visits, follows metric for
 *  this media product type». Ler os nomes é o que permite repetir o pedido
 *  sem eles em vez de perder o snapshot inteiro. */
export function unsupportedMetricsFrom(message: string): string[] {
  const m = message.match(/does not support the (.+?) metric/i);
  if (!m) return [];
  return m[1]
    .split(/,| and /)
    .map((s) => s.trim())
    .filter((s) => /^[a-z0-9_]+$/i.test(s));
}

export function classifyMetaError(input: {
  status: number | null;
  body: { error?: RawMetaError } | null;
  fallbackMessage?: string;
}): MetaError {
  const err = input.body?.error ?? {};
  const rawMessage = typeof err.message === 'string' ? err.message : (input.fallbackMessage ?? 'Falha desconhecida na Meta.');
  const message = redact(rawMessage);
  const code = typeof err.code === 'number' ? err.code : null;
  const subcode = typeof err.error_subcode === 'number' ? err.error_subcode : null;
  const status = input.status;

  const base = { message, status, code, subcode, unsupportedMetrics: [] as string[], retryAfterSeconds: null as number | null };

  // 190 é a família toda de problemas de token. O subcódigo distingue.
  if (code === 190) {
    // 458/463 = sessão inválida ou expirada; 460/463 revogada pela pessoa.
    const revogado = subcode === 458 || subcode === 460 || subcode === 463 || /revoke|deauthor/i.test(message);
    return { ...base, kind: revogado ? 'auth_revoked' : 'token_expired', retryable: false };
  }

  if (code === 4 || code === 17 || code === 32 || code === 613 || status === 429) {
    return { ...base, kind: 'rate_limited', retryable: true, retryAfterSeconds: 60 };
  }

  if (code === 10 || code === 200 || code === 803) {
    return { ...base, kind: 'permission_missing', retryable: false };
  }

  if (code === 100) {
    const metrics = unsupportedMetricsFrom(rawMessage);
    if (metrics.length) {
      return { ...base, kind: 'unsupported_metric', unsupportedMetrics: metrics, retryable: false };
    }
    // Publicações anteriores à conversão para conta profissional não têm
    // insights. Não é erro nosso e não é zero: é indisponível.
    if (subcode === 2108006 || /convert|business account|conta comercial|conta profissional/i.test(message)) {
      return { ...base, kind: 'not_available', retryable: false };
    }
    if (/must be one of the following values/i.test(message)) {
      return { ...base, kind: 'unsupported_metric', retryable: false };
    }
    return { ...base, kind: 'invalid_request', retryable: false };
  }

  if (status !== null && status >= 500) {
    return { ...base, kind: 'transient', retryable: true, retryAfterSeconds: 5 };
  }

  if (status !== null && status >= 400 && status < 500) {
    return { ...base, kind: 'invalid_request', retryable: false };
  }

  return { ...base, kind: 'provider_unknown', retryable: status === null };
}

/** O que a Carol lê quando a integração parte. Sem código, sem jargão. */
export const USER_MESSAGE: Record<MetaErrorKind, string> = {
  auth_revoked: 'O acesso ao Instagram foi retirado. Preciso que você ligue de novo.',
  token_expired: 'O acesso ao Instagram expirou. Preciso que você ligue de novo.',
  rate_limited: 'O Instagram pediu para eu esperar um pouco. Volto a tentar sozinho.',
  permission_missing: 'Falta uma permissão no Instagram para eu ler esse dado.',
  unsupported_metric: 'O Instagram não fornece essa métrica para este tipo de conteúdo.',
  not_available: 'O Instagram não tem esse dado para este conteúdo.',
  transient: 'O Instagram falhou agora. Volto a tentar sozinho.',
  invalid_request: 'Pedi uma coisa que o Instagram não entendeu. Vou investigar.',
  timeout: 'O Instagram demorou demais a responder. Volto a tentar.',
  provider_unknown: 'Não consegui falar com o Instagram agora.',
};

/** Um erro que deve gerar uma ação no Hoje? Só o que ela consegue resolver. */
export const NEEDS_CAROL: readonly MetaErrorKind[] = ['auth_revoked', 'token_expired', 'permission_missing'];
