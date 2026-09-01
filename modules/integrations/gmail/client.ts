import 'server-only';
import { decodeEntities } from '@/lib/html';

/** Cliente REST do Gmail. Só o que a operação precisa: perfil, histórico
 *  incremental, leitura de mensagem e criação de rascunho.
 *
 *  Não existe aqui nenhuma forma de enviar. `users.messages.send` não é
 *  chamado em lado nenhum e o scope pedido nem sequer o permite — o envio é
 *  sempre a Carol a carregar no botão dela. */

const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

export class GmailError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(`gmail_${status}:${code}`);
    this.name = 'GmailError';
  }
}

async function call<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...init?.headers },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string; status?: string } } | null;
    throw new GmailError(res.status, body?.error?.status ?? String(res.status));
  }
  return (await res.json()) as T;
}

export type Profile = { emailAddress: string; historyId: string; messagesTotal: number };

export const getProfile = (token: string) => call<Profile>(token, '/profile');

type Header = { name: string; value: string };
type Part = { mimeType?: string; body?: { data?: string; size?: number }; parts?: Part[]; headers?: Header[] };

export type RawMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: Part & { headers?: Header[] };
};

export const getMessage = (token: string, id: string) =>
  call<RawMessage>(token, `/messages/${id}?format=full`);

export type MessageRef = { id: string; threadId: string };

export async function listMessages(
  token: string,
  query: string,
  maxResults = 50,
  pageToken?: string,
): Promise<{ messages: MessageRef[]; nextPageToken?: string }> {
  const params = new URLSearchParams({ q: query, maxResults: String(maxResults) });
  if (pageToken) params.set('pageToken', pageToken);
  const res = await call<{ messages?: MessageRef[]; nextPageToken?: string }>(
    token,
    `/messages?${params}`,
  );
  return { messages: res.messages ?? [], nextPageToken: res.nextPageToken };
}

type HistoryRecord = {
  id: string;
  messagesAdded?: { message: MessageRef }[];
};

/** Histórico incremental. É isto que evita reler a caixa toda a cada
 *  sincronização — o cursor avança só depois de o processamento ter durado. */
export async function listHistory(
  token: string,
  startHistoryId: string,
  pageToken?: string,
): Promise<{ messages: MessageRef[]; historyId: string | null; nextPageToken?: string }> {
  const params = new URLSearchParams({
    startHistoryId,
    historyTypes: 'messageAdded',
  });
  if (pageToken) params.set('pageToken', pageToken);

  const res = await call<{ history?: HistoryRecord[]; historyId?: string; nextPageToken?: string }>(
    token,
    `/history?${params}`,
  );

  const messages: MessageRef[] = [];
  const seen = new Set<string>();
  for (const record of res.history ?? []) {
    for (const added of record.messagesAdded ?? []) {
      if (seen.has(added.message.id)) continue;
      seen.add(added.message.id);
      messages.push(added.message);
    }
  }
  return { messages, historyId: res.historyId ?? null, nextPageToken: res.nextPageToken };
}

const decode = (data: string) => Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

/** Preferimos texto simples. Só se não houver é que o HTML é limpo — e o
 *  resultado é texto normalizado, não a mensagem inteira com marcação: salvar
 *  MIME cru seria armazenar muito mais dados pessoais do que a operação
 *  precisa. */
function extractBody(part: Part | undefined, depth = 0): { text: string; html: string } {
  if (!part || depth > 8) return { text: '', html: '' };

  if (part.body?.data) {
    const content = decode(part.body.data);
    if (part.mimeType === 'text/plain') return { text: content, html: '' };
    if (part.mimeType === 'text/html') return { text: '', html: content };
  }

  let text = '';
  let html = '';
  for (const child of part.parts ?? []) {
    const found = extractBody(child, depth + 1);
    text ||= found.text;
    html ||= found.html;
  }
  return { text, html };
}

const stripHtml = (html: string) =>
  decodeEntities(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/** Corta a citação da mensagem anterior. Sem isto, cada resposta reingeria a
 *  conversa toda e o extractor lia fatos antigos como se fossem novos. */
const QUOTE_MARKERS = [
  /^On .+ wrote:$/m,
  /^Em .+ escreveu:$/m,
  /^-{2,}\s*Original Message\s*-{2,}$/im,
  /^_{5,}$/m,
  /^>{1,}\s/m,
  /^De:\s.+$/m,
  /^From:\s.+$/m,
];

function stripQuotedReply(text: string): string {
  let cut = text.length;
  for (const marker of QUOTE_MARKERS) {
    const match = marker.exec(text);
    if (match?.index !== undefined && match.index < cut && match.index > 40) cut = match.index;
  }
  return text.slice(0, cut).trim();
}

export type ParsedMessage = {
  id: string;
  threadId: string;
  subject: string;
  from: { address: string; name: string };
  to: string[];
  sentAt: string;
  bodyText: string;
  snippet: string;
  labels: string[];
};

const header = (headers: Header[] | undefined, name: string) =>
  headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';

/** «Ferino Hendry <ferino.hendry@orbitkey.com>» → nome + endereço. */
export function parseAddress(raw: string): { address: string; name: string } {
  const angled = raw.match(/^(.*?)<([^>]+)>\s*$/);
  if (angled) {
    return {
      name: angled[1].trim().replace(/^["']|["']$/g, ''),
      address: angled[2].trim().toLowerCase(),
    };
  }
  return { name: '', address: raw.trim().toLowerCase() };
}

const splitAddresses = (raw: string) =>
  raw
    .split(',')
    .map((piece) => parseAddress(piece).address)
    .filter(Boolean);

export function parseMessage(raw: RawMessage): ParsedMessage {
  const headers = raw.payload?.headers;
  const { text, html } = extractBody(raw.payload);
  const body = stripQuotedReply(text || stripHtml(html));

  return {
    id: raw.id,
    threadId: raw.threadId,
    subject: header(headers, 'Subject'),
    from: parseAddress(header(headers, 'From')),
    to: [...splitAddresses(header(headers, 'To')), ...splitAddresses(header(headers, 'Cc'))],
    sentAt: raw.internalDate
      ? new Date(Number(raw.internalDate)).toISOString()
      : new Date().toISOString(),
    bodyText: body,
    snippet: decodeEntities(raw.snippet ?? body.slice(0, 200)).trim(),
    labels: raw.labelIds ?? [],
  };
}

/** Cria um rascunho na caixa da Carol. É o mais longe que a automação vai:
 *  a mensagem fica escrita, ela lê, corrige e clica em enviar. */
export async function createDraft(
  token: string,
  input: { to: string; subject: string; body: string; threadId?: string; from: string },
): Promise<{ id: string }> {
  const mime = [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    input.body,
  ].join('\r\n');

  const raw = Buffer.from(mime, 'utf8').toString('base64url');

  const res = await call<{ id: string }>(token, '/drafts', {
    method: 'POST',
    body: JSON.stringify({ message: { raw, ...(input.threadId ? { threadId: input.threadId } : {}) } }),
  });
  return { id: res.id };
}

/** Envia uma mensagem pela conta dela.
 *
 *  O remetente NÃO é um parâmetro livre: vem sempre da conta ligada. Aceitar um
 *  `from` arbitrário seria dar a quem chamasse a capacidade de escrever em nome
 *  de outra pessoa a partir da caixa da Carol. */
export async function sendMessage(
  token: string,
  input: { to: string; subject: string; body: string; from: string; threadId?: string },
): Promise<{ id: string; threadId: string }> {
  const mime = [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${encodeHeader(input.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    input.body,
  ].join('\r\n');

  const raw = Buffer.from(mime, 'utf8').toString('base64url');
  const res = await call<{ id: string; threadId: string }>(token, '/messages/send', {
    method: 'POST',
    body: JSON.stringify({ raw, ...(input.threadId ? { threadId: input.threadId } : {}) }),
  });
  return { id: res.id, threadId: res.threadId };
}

/** Um assunto com acentos não passa num cabeçalho em ASCII. RFC 2047. */
function encodeHeader(value: string): string {
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}
