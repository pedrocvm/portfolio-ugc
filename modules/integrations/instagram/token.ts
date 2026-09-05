/** Decisões de ciclo de vida do token, puras.
 *
 *  A parte com rede vive em `oauth.ts`. Isto responde a «é preciso renovar?» e
 *  «esta ligação está saudável?» sem depender de credencial nenhuma, para o
 *  teste conseguir cobrir a regra que interessa: **não depender de alguém
 *  copiar um token a cada sessenta dias**.
 *
 *  Não se grava «60 dias» como verdade de negócio. O `expires_in` vem na
 *  resposta e é ele que manda; a janela de segurança é que é nossa.
 *
 *  Puro. */

export const TOKEN_STATUSES = ['active', 'expiring', 'expired', 'revoked', 'missing'] as const;
export type TokenStatus = (typeof TOKEN_STATUSES)[number];

/** A partir de quantos dias antes do fim se renova.
 *
 *  A Meta só deixa renovar um token de longa duração com mais de 24 h de vida,
 *  por isso a janela tem de ser larga o suficiente para várias tentativas
 *  falharem sem se perder a ligação. */
export const REFRESH_WINDOW_DAYS = 10;

/** Abaixo disto a renovação já não é aceite pela Meta. */
export const MIN_AGE_TO_REFRESH_HOURS = 24;

export type TokenState = {
  expiresAt: string | null;
  status: string;
  lastRefreshAt: string | null;
  issuedAt: string | null;
};

export type RefreshDecision =
  | { refresh: true; because: string }
  | { refresh: false; because: string; status: TokenStatus };

const DAY = 24 * 60 * 60 * 1000;

export function tokenStatus(state: TokenState, now: Date = new Date()): TokenStatus {
  if (state.status === 'revoked') return 'revoked';
  if (!state.expiresAt) return state.status === 'connected' ? 'active' : 'missing';
  const restante = new Date(state.expiresAt).getTime() - now.getTime();
  if (!Number.isFinite(restante)) return 'missing';
  if (restante <= 0) return 'expired';
  if (restante <= REFRESH_WINDOW_DAYS * DAY) return 'expiring';
  return 'active';
}

/** Deve o trabalho diário renovar este token agora?
 *
 *  Só dentro da janela, só se ainda for válido, e só se tiver idade suficiente
 *  para a Meta aceitar. Renovar todos os dias seria gastar chamadas e arriscar
 *  invalidar uma ligação boa. */
export function shouldRefresh(state: TokenState, now: Date = new Date()): RefreshDecision {
  const status = tokenStatus(state, now);

  if (status === 'revoked') return { refresh: false, because: 'O acesso foi retirado. Renovar não resolve; é preciso ligar de novo.', status };
  if (status === 'missing') return { refresh: false, because: 'Não há token salvo.', status };
  if (status === 'expired') return { refresh: false, because: 'O token já expirou. É preciso ligar de novo.', status };
  if (status === 'active') return { refresh: false, because: 'Ainda falta muito para expirar.', status };

  const emitido = state.lastRefreshAt ?? state.issuedAt;
  if (emitido) {
    const horas = (now.getTime() - new Date(emitido).getTime()) / (60 * 60 * 1000);
    if (horas < MIN_AGE_TO_REFRESH_HOURS) {
      return { refresh: false, because: 'A Meta não renova um token com menos de 24 horas.', status };
    }
  }

  const dias = Math.ceil((new Date(state.expiresAt!).getTime() - now.getTime()) / DAY);
  return { refresh: true, because: `Faltam ${dias} ${dias === 1 ? 'dia' : 'dias'} para expirar.` };
}

/** `expires_at` a partir do que a resposta disse, não de uma constante.
 *
 *  Se a Meta mudar a duração, a ligação passa a saber-o na renovação seguinte
 *  sem alterar código. */
export function expiryFrom(expiresInSeconds: number | null | undefined, now: Date = new Date()): string | null {
  if (typeof expiresInSeconds !== 'number' || !Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) return null;
  return new Date(now.getTime() + expiresInSeconds * 1000).toISOString();
}

export type Health = {
  status: TokenStatus;
  /** O que a Carol lê. Sem jargão, sem número de erro. */
  message: string;
  /** Verdadeiro quando ela tem de fazer alguma coisa. */
  needsCarol: boolean;
  expiresAt: string | null;
  lastSuccessAt: string | null;
};

export function health(state: TokenState & { lastSuccessAt: string | null }, now: Date = new Date()): Health {
  const status = tokenStatus(state, now);
  const message: Record<TokenStatus, string> = {
    active: 'Instagram ligado.',
    expiring: 'Instagram ligado. Vou renovar o acesso sozinho.',
    expired: 'O acesso ao Instagram expirou. Precisa ligar de novo.',
    revoked: 'O acesso ao Instagram foi retirado. Precisa ligar de novo.',
    missing: 'O Instagram ainda não está ligado.',
  };
  return {
    status,
    message: message[status],
    needsCarol: status === 'expired' || status === 'revoked' || status === 'missing',
    expiresAt: state.expiresAt,
    lastSuccessAt: state.lastSuccessAt,
  };
}
