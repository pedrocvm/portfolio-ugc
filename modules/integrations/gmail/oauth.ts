import 'server-only';

import { decryptSecret, encryptSecret, signPayload, verifyPayload } from '@/lib/crypto';
import { supabaseService } from '@/lib/supabase/service';

/** OAuth do Google sem SDK. A troca de código por token é um POST com
 *  `application/x-www-form-urlencoded`; um pacote de dezenas de megabytes para
 *  fazer isso seria pagar peso por nada.
 *
 *  Os refresh tokens são cifrados antes de tocarem na base, nunca voltam ao
 *  browser e nunca aparecem num log. */

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

/** O mínimo para o CRM passivo funcionar:
 *  - `gmail.readonly` para ler conversas;
 *  - `gmail.compose` para escrever rascunhos e enviar o que ela aprovar.
 *
 *  O scope `gmail.send` continua a não existir aqui, e isso é de propósito: o
 *  que existe é envio a pedido de uma pessoa. Nenhum trabalho de fundo envia —
 *  a prospeção diária pesquisa, escreve e prepara, e pára. A regra 3 do
 *  CarolOS é que nada sai sozinho, e continua sendo verdade: sai quando ela
 *  clica em enviar. */
export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
];

export type GoogleConfig = { clientId: string; clientSecret: string; redirectUri: string };

export function googleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const base = process.env.APP_BASE_URL ?? 'http://localhost:3000';
  return {
    clientId,
    clientSecret,
    redirectUri: process.env.GOOGLE_REDIRECT_URI ?? `${base}/api/integrations/google/oauth/callback`,
  };
}

export const googleConfigured = () => googleConfig() !== null;

/** O `state` é assinado e amarrado ao id do usuário da sessão. Sem isto,
 *  qualquer pessoa podia mandar a Carol a um callback preparado e ligar a
 *  conta de Gmail dela a outro lugar. */
export async function buildState(appUserId: string): Promise<string> {
  const payload = `${appUserId}.${Date.now()}.${crypto.randomUUID()}`;
  return `${Buffer.from(payload).toString('base64url')}.${await signPayload(payload)}`;
}

const STATE_TTL_MS = 15 * 60 * 1000;

export async function readState(state: string): Promise<{ appUserId: string } | null> {
  const [encoded, signature] = state.split('.');
  if (!encoded || !signature) return null;

  const payload = Buffer.from(encoded, 'base64url').toString();
  if (!(await verifyPayload(payload, signature))) return null;

  const [appUserId, issuedAt] = payload.split('.');
  if (!appUserId || !issuedAt) return null;
  if (Date.now() - Number(issuedAt) > STATE_TTL_MS) return null;

  return { appUserId };
}

export function authorizeUrl(cfg: GoogleConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: GMAIL_SCOPES.join(' '),
    // offline + consent garantem um refresh token mesmo numa reautorização;
    // sem eles, a segunda ligação vem só com access token e a sincronização
    // morre em uma hora.
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `${AUTH_URL}?${params}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  const json = (await res.json()) as TokenResponse;
  if (!res.ok || json.error) {
    // A mensagem do Google não traz segredos, mas o corpo do pedido traria:
    // por isso só o código sai daqui.
    throw new Error(`google_oauth:${json.error ?? res.status}`);
  }
  return json;
}

export async function exchangeCode(cfg: GoogleConfig, code: string) {
  return postToken({
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    grant_type: 'authorization_code',
  });
}

export async function refreshAccessToken(cfg: GoogleConfig, refreshToken: string) {
  return postToken({
    refresh_token: refreshToken,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: 'refresh_token',
  });
}

export type Connection = {
  id: string;
  appUserId: string;
  account: string;
  status: string;
  cursor: string | null;
  scopes: string[];
};

export async function saveConnection(input: {
  appUserId: string;
  account: string;
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  scopes: string[];
}) {
  const db = supabaseService();

  // Numa reautorização o Google pode não reenviar o refresh token. Sobrepor o
  // que está salvo com `null` matava a ligação em silêncio.
  const encryptedRefresh = input.refreshToken ? await encryptSecret(input.refreshToken) : undefined;

  const { error } = await db.from('integration_connection').upsert(
    {
      provider: 'google_gmail',
      app_user_id: input.appUserId,
      account_identifier: input.account,
      status: 'connected',
      scopes: input.scopes,
      encrypted_access_token: await encryptSecret(input.accessToken),
      token_expires_at: new Date(Date.now() + input.expiresIn * 1000).toISOString(),
      ...(encryptedRefresh ? { encrypted_refresh_token: encryptedRefresh } : {}),
      last_error_code: null,
      last_error_at: null,
    },
    { onConflict: 'provider,app_user_id,account_identifier' },
  );

  // O cliente do Supabase devolve o erro, não o lança. Sem isto uma escrita
  // recusada passava despercebida e o callback dizia «ligado» com a tabela
  // vazia — que é pior do que falhar, porque ela deixa de vigiar a caixa.
  if (error) throw new Error(`save_connection_failed: ${error.code ?? error.message}`);
}

/** Devolve um access token válido, renovando-o quando falta menos de um minuto.
 *  O token nunca sai desta camada para cima com o valor em claro senão dentro
 *  do cabeçalho de um pedido. */
/** As caixas ligadas, por ordem de ligação. Sem argumento devolve as de toda a
 *  gente, que hoje é só a Carol — o filtro existe para o dia em que não for. */
export async function listMailboxes(appUserId?: string): Promise<Mailbox[]> {
  let query = supabaseService()
    .from('integration_connection')
    .select('id, account_identifier, status')
    .eq('provider', 'google_gmail')
    .neq('status', 'revoked')
    .order('created_at');
  if (appUserId) query = query.eq('app_user_id', appUserId);

  const { data, error } = await query;
  if (error) throw new Error(`list_mailboxes_failed: ${error.code ?? error.message}`);
  return (data ?? []).map((r) => ({ id: r.id, account: r.account_identifier, status: r.status }));
}

export type Mailbox = { id: string; account: string; status: string };

/** A caixa de onde a prospeção sai.
 *
 *  Há duas contas do Gmail ligadas, e a escolha era «a mais antiga» — que é o
 *  mesmo que não escolher. A abordagem podia sair de uma conta enquanto a
 *  verificação de «já falei com esta marca» lia a outra, e ela não tinha como
 *  saber de onde tinha saído. Quem escolhe é o código, num sítio só.
 *
 *  Se esta conta não estiver ligada, usa-se a que houver: uma conta trocada é
 *  um problema, deixar de enviar é outro maior. */
export const OUTREACH_ACCOUNT = 'carolxqueiroz05@gmail.com';

/** Sem `connectionId` devolve a caixa da prospeção. Isso serve para um pedido
 *  avulso; quem sincroniza percorre `listMailboxes` e nomeia a caixa, senão
 *  lia sempre a mesma e a segunda conta nunca era vista. */
export async function accessTokenFor(connectionId?: string): Promise<{ token: string; connectionId: string; account: string } | null> {
  const cfg = googleConfig();
  if (!cfg) return null;

  const db = supabaseService();
  let query = db
    .from('integration_connection')
    .select('id, app_user_id, account_identifier, status, encrypted_access_token, encrypted_refresh_token, token_expires_at')
    .eq('provider', 'google_gmail')
    .order('created_at');
  if (connectionId) query = query.eq('id', connectionId);

  const { data: rows } = await query.limit(connectionId ? 1 : 20);
  const ligadas = (rows ?? []).filter((r) => r.status !== 'revoked');
  const data = connectionId
    ? ligadas[0]
    : (ligadas.find((r) => r.account_identifier === OUTREACH_ACCOUNT) ?? ligadas[0]);
  if (!data) return null;

  const stillValid =
    data.encrypted_access_token &&
    data.token_expires_at &&
    new Date(data.token_expires_at).getTime() - Date.now() > 60_000;

  if (stillValid) {
    return {
      token: await decryptSecret(data.encrypted_access_token as string),
      connectionId: data.id,
      account: data.account_identifier,
    };
  }

  if (!data.encrypted_refresh_token) {
    await markError(data.id, 'no_refresh_token');
    return null;
  }

  try {
    const refreshed = await refreshAccessToken(cfg, await decryptSecret(data.encrypted_refresh_token));
    await db
      .from('integration_connection')
      .update({
        encrypted_access_token: await encryptSecret(refreshed.access_token),
        token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        status: 'connected',
        last_error_code: null,
      })
      .eq('id', data.id);
    return { token: refreshed.access_token, connectionId: data.id, account: data.account_identifier };
  } catch (error) {
    const code = error instanceof Error ? error.message : 'refresh_failed';
    await markError(data.id, code);
    return null;
  }
}

export async function markError(connectionId: string, code: string) {
  await supabaseService()
    .from('integration_connection')
    .update({
      status: code.includes('invalid_grant') ? 'revoked' : 'error',
      last_error_code: code.slice(0, 100),
      last_error_at: new Date().toISOString(),
    })
    .eq('id', connectionId);
}

export async function updateCursor(connectionId: string, cursor: string) {
  await supabaseService()
    .from('integration_connection')
    .update({
      cursor,
      last_sync_at: new Date().toISOString(),
      last_success_at: new Date().toISOString(),
      status: 'connected',
      last_error_code: null,
    })
    .eq('id', connectionId);
}

/** Desliga uma caixa concreta. O id é obrigatório desde que há mais do que uma:
 *  sem ele, desligar a segunda conta revogava a primeira que aparecesse. */
export async function disconnect(appUserId: string, connectionId: string) {
  const db = supabaseService();
  const { data } = await db
    .from('integration_connection')
    .select('id, encrypted_refresh_token')
    .eq('provider', 'google_gmail')
    .eq('app_user_id', appUserId)
    .eq('id', connectionId)
    .maybeSingle();

  if (!data) return;

  // Revogar do lado do Google também: apagar a linha e deixar a autorização
  // viva seria deixar uma chave dada a alguém que já não a usa.
  if (data.encrypted_refresh_token) {
    try {
      const token = await decryptSecret(data.encrypted_refresh_token);
      await fetch(REVOKE_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token }),
      });
    } catch {
      /* revogar é best-effort; apagar localmente não pode ficar refém disso */
    }
  }

  await db
    .from('integration_connection')
    .update({
      status: 'revoked',
      encrypted_access_token: null,
      encrypted_refresh_token: null,
      token_expires_at: null,
    })
    .eq('id', data.id);
}
