/** Verificação de webhooks da Meta: token, assinatura e chave de deduplicação.
 *
 *  Três coisas que um handler de webhook tem de fazer bem, e que este ficheiro
 *  existe para não deixar ninguém esquecer:
 *
 *  1. **Comparar em tempo constante.** Um `===` sobre o verify token sai no
 *     primeiro byte diferente, e isso chega para o adivinhar byte a byte.
 *  2. **Não confiar no corpo.** A Meta assina o payload em `X-Hub-Signature-256`.
 *     Sem verificar, qualquer pessoa que descubra o URL escreve na base.
 *  3. **Ser idempotente.** A Meta reentrega. Sem chave de deduplicação, o
 *     mesmo comentário entra três vezes.
 *
 *  Puro e sem base de dados, para se conseguir testar sem credencial nenhuma.
 *  A escrita vive em `webhooks.ts`. */

/** Comparação em tempo constante. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type VerifyResult = { ok: true; challenge: string } | { ok: false; status: number; reason: string };

/** O `GET` de verificação que a Meta faz ao registar o callback. */
export function verifySubscription(params: URLSearchParams, expectedToken: string | null): VerifyResult {
  if (!expectedToken) return { ok: false, status: 503, reason: 'Falta INSTAGRAM_WEBHOOK_VERIFY_TOKEN.' };

  const mode = params.get('hub.mode');
  const token = params.get('hub.verify_token');
  const challenge = params.get('hub.challenge');

  if (mode !== 'subscribe') return { ok: false, status: 400, reason: 'modo inválido' };
  if (!token || !safeEqual(token, expectedToken)) return { ok: false, status: 403, reason: 'token inválido' };
  if (!challenge) return { ok: false, status: 400, reason: 'sem challenge' };

  return { ok: true, challenge };
}

/** Assinatura `sha256=<hex>` do corpo cru com o App Secret.
 *
 *  O corpo tem de ser o texto exato que chegou. Reserializar o JSON muda
 *  espaços e a assinatura deixa de bater. */
export async function verifySignature(rawBody: string, header: string | null, appSecret: string | null): Promise<boolean> {
  if (!appSecret) return false;
  if (!header?.startsWith('sha256=')) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const esperado = Buffer.from(mac).toString('hex');
  return safeEqual(header.slice(7), esperado);
}

export type WebhookEnvelope = {
  dedupeKey: string;
  topic: string;
  field: string | null;
  payload: unknown;
};

/** A chave de deduplicação.
 *
 *  Prefere o id do evento quando existe; senão o hash do corpo. Um corpo
 *  idêntico reentregue é o mesmo evento. */
export async function envelopeFor(rawBody: string, payload: unknown): Promise<WebhookEnvelope> {
  const p = payload as { object?: string; entry?: { id?: string; time?: number; changes?: { field?: string; value?: { id?: string } }[] }[] };
  const entry = p?.entry?.[0];
  const change = entry?.changes?.[0];
  const eventId = change?.value?.id;

  const { hashContent } = await import('@/lib/crypto');
  const dedupeKey = eventId ? `ig:${change?.field ?? 'unknown'}:${eventId}` : `ig:hash:${await hashContent(rawBody)}`;

  return {
    dedupeKey,
    topic: p?.object ?? 'unknown',
    field: change?.field ?? null,
    payload,
  };
}

