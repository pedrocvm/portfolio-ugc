/** Configuração da integração Meta, num sítio só.
 *
 *  Nenhum módulo escreve `graph.instagram.com` nem uma versão de API. Trocar
 *  de versão não pode ser um pull request espalhado por dez ficheiros.
 *
 *  Os IDs conhecidos da conta **não são configuração**: vivem na ligação
 *  persistida, com a origem de cada um. `INSTAGRAM_ACCOUNT_ID` e
 *  `INSTAGRAM_ME_ID` são coisas diferentes — `/me` devolve `id` (app-scoped) e
 *  `user_id` (a conta) — e assumir equivalência é o tipo de erro que só
 *  aparece meses depois, quando um endpoint aceita um e recusa o outro.
 *
 *  Server-only: o Client Secret e o token nunca entram no pacote do browser. */

import 'server-only';

export const GRAPH_HOST = 'https://graph.instagram.com';
export const AUTH_HOST = 'https://www.instagram.com';
export const DEFAULT_API_VERSION = 'v26.0';

export const INSTAGRAM_PROVIDER = 'instagram';

/** Os scopes que a app tem autorizados. `content_publish` está na lista porque
 *  a permissão existe; publicar continua a ser ação externa com confirmação, e
 *  nenhum trabalho de fundo lhe chega. */
export const INSTAGRAM_SCOPES = [
  'instagram_business_basic',
  'instagram_business_manage_insights',
  'instagram_business_manage_comments',
  'instagram_business_manage_messages',
  'instagram_business_content_publish',
] as const;

export type InstagramConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  apiVersion: string;
  webhookVerifyToken: string | null;
};

export const apiVersion = (): string => process.env.INSTAGRAM_GRAPH_API_VERSION || DEFAULT_API_VERSION;

export function instagramConfig(): InstagramConfig | null {
  const clientId = process.env.INSTAGRAM_CLIENT_ID;
  const clientSecret = process.env.INSTAGRAM_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const base = process.env.APP_BASE_URL ?? 'http://localhost:3000';
  return {
    clientId,
    clientSecret,
    redirectUri: process.env.INSTAGRAM_REDIRECT_URI ?? `${base}/api/integrations/instagram/oauth/callback`,
    apiVersion: apiVersion(),
    webhookVerifyToken: process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN ?? null,
  };
}

export const instagramConfigured = (): boolean => instagramConfig() !== null;

/** Token de arranque, só para validar o sync antes de o OAuth estar ligado.
 *
 *  É um caminho de desenvolvimento, não a arquitetura. Não existe tela para
 *  colar token: quando o OAuth correr, a ligação persistida ganha sempre. */
export const bootstrapToken = (): string | null => process.env.INSTAGRAM_USER_ACCESS_TOKEN || null;

/** O que falta configurar, em português, para a tela de Definições. */
export function missingConfig(): string[] {
  const falta: string[] = [];
  if (!process.env.INSTAGRAM_CLIENT_ID) falta.push('INSTAGRAM_CLIENT_ID');
  if (!process.env.INSTAGRAM_CLIENT_SECRET) falta.push('INSTAGRAM_CLIENT_SECRET');
  if (!process.env.APP_BASE_URL && !process.env.INSTAGRAM_REDIRECT_URI) falta.push('APP_BASE_URL');
  return falta;
}
