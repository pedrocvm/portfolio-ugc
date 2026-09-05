/** O único sítio que fala com a Graph API do Instagram.
 *
 *  Sem SDK: a Graph é JSON sobre HTTP e o adaptador cabe aqui. Uma dependência
 *  de dezenas de megabytes para fazer um GET com um parâmetro é peso por nada,
 *  e a abstração que interessa é esta — não a do fornecedor.
 *
 *  Responsabilidades: montar o pedido, paginar, classificar o erro, recuar com
 *  jitter no que é transitório, e **nunca deixar o token sair** — nem em log,
 *  nem em mensagem de erro, nem em URL registado.
 *
 *  Uma métrica não suportada não derruba o sync: o cliente lê os nomes que a
 *  Meta recusou e repete o pedido sem eles.
 *
 *  Server-only. */

import 'server-only';

import { GRAPH_HOST, apiVersion } from './config';
import { MetaApiError, classifyMetaError, redact, type MetaError } from './errors';

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 3;

export type ClientOptions = {
  accessToken: string;
  version?: string;
  timeoutMs?: number;
  /** Injetável para os testes correrem contra fixtures sem rede. */
  fetchImpl?: typeof fetch;
  /** Base do recuo entre tentativas. Os testes baixam-na para não esperarem
   *  segundos reais a provar uma regra que é de milissegundos. */
  backoffBaseMs?: number;
};

export type RequestOptions = {
  params?: Record<string, string | number | undefined>;
  method?: 'GET' | 'POST';
  timeoutMs?: number;
  /** Quantas tentativas no máximo. Um 4xx permanente nunca repete. */
  attempts?: number;
};

/** O que fica no registo de um pedido. Sem token, sem query completa. */
export type CallLog = {
  path: string;
  status: number | null;
  ms: number;
  errorKind: string | null;
};

const jitter = (base: number) => base + Math.floor(Math.random() * base * 0.3);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class InstagramClient {
  readonly version: string;
  readonly calls: CallLog[] = [];
  private readonly token: string;
  private readonly timeoutMs: number;
  private readonly doFetch: typeof fetch;
  private readonly backoffBaseMs: number;

  constructor(opts: ClientOptions) {
    this.token = opts.accessToken;
    this.version = opts.version ?? apiVersion();
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.doFetch = opts.fetchImpl ?? fetch;
    this.backoffBaseMs = opts.backoffBaseMs ?? 1000;
  }

  /** Um pedido, com recuo. `path` começa sem barra: `me/media`.
   *
   *  Também aceita uma URL absoluta — é o que a paginação da Meta devolve em
   *  `paging.next`, já com o cursor e o token dentro. */
  async request<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
    const attempts = Math.max(1, opts.attempts ?? MAX_ATTEMPTS);
    let last: MetaError | null = null;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      const started = Date.now();
      const url = this.buildUrl(path, opts.params);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? this.timeoutMs);

      try {
        const res = await this.doFetch(url, {
          method: opts.method ?? 'GET',
          signal: controller.signal,
          headers: { accept: 'application/json' },
        });
        const text = await res.text();
        const body = text ? (JSON.parse(text) as Record<string, unknown>) : null;

        if (res.ok && body && !('error' in body)) {
          this.calls.push({ path: safePath(path), status: res.status, ms: Date.now() - started, errorKind: null });
          return body as T;
        }

        last = classifyMetaError({ status: res.status, body: body as { error?: Record<string, unknown> } | null });
        this.calls.push({ path: safePath(path), status: res.status, ms: Date.now() - started, errorKind: last.kind });

        if (!last.retryable || attempt === attempts) throw new MetaApiError(last);
        await wait(jitter((last.retryAfterSeconds ?? 2) * this.backoffBaseMs * attempt));
      } catch (error) {
        clearTimeout(timer);
        if (error instanceof MetaApiError) throw error;

        const abortado = error instanceof Error && error.name === 'AbortError';
        last = {
          kind: abortado ? 'timeout' : 'provider_unknown',
          message: redact(error instanceof Error ? error.message : 'Falha de rede.'),
          status: null,
          code: null,
          subcode: null,
          unsupportedMetrics: [],
          retryable: true,
          retryAfterSeconds: 2,
        };
        this.calls.push({ path: safePath(path), status: null, ms: Date.now() - started, errorKind: last.kind });
        if (attempt === attempts) throw new MetaApiError(last);
        await wait(jitter(2 * this.backoffBaseMs * attempt));
        continue;
      } finally {
        clearTimeout(timer);
      }
    }

    throw new MetaApiError(last ?? { kind: 'provider_unknown', message: 'Falha desconhecida.', status: null, code: null, subcode: null, unsupportedMetrics: [], retryable: false, retryAfterSeconds: null });
  }

  /** Percorre todas as páginas até ao limite. A Meta devolve `paging.next` já
   *  com token; segue-se essa URL em vez de reconstruir o cursor à mão. */
  async paginate<T>(path: string, opts: RequestOptions & { maxPages?: number } = {}): Promise<T[]> {
    const max = opts.maxPages ?? 10;
    const out: T[] = [];
    let alvo: string | null = path;
    let params: RequestOptions['params'] | undefined = opts.params;

    for (let page = 0; page < max && alvo; page++) {
      const body: { data?: T[]; paging?: { next?: string } } = await this.request(alvo, { ...opts, params });
      out.push(...(body.data ?? []));
      alvo = body.paging?.next ?? null;
      params = undefined;
    }
    return out;
  }

  /** Insights com recuperação de métrica não suportada.
   *
   *  Quando a Meta recusa nomes específicos, repete sem eles e devolve a lista
   *  do que ficou de fora. É o que separa «perdi o snapshot» de «este tipo de
   *  mídia não tem essas duas métricas». */
  async insights(
    objectId: string,
    metrics: readonly string[],
    extra: Record<string, string | number | undefined> = {},
  ): Promise<{ payload: unknown; requested: string[]; unsupported: string[]; unavailable: MetaError | null }> {
    let pedidas = [...metrics];
    const removidas: string[] = [];

    for (let tentativa = 0; tentativa < 3 && pedidas.length > 0; tentativa++) {
      try {
        const payload = await this.request(`${objectId}/insights`, {
          params: { metric: pedidas.join(','), ...extra },
          attempts: 2,
        });
        return { payload, requested: [...metrics], unsupported: removidas, unavailable: null };
      } catch (error) {
        if (!(error instanceof MetaApiError)) throw error;
        const d = error.detail;

        if (d.kind === 'unsupported_metric' && d.unsupportedMetrics.length) {
          const fora = new Set(d.unsupportedMetrics);
          removidas.push(...d.unsupportedMetrics);
          pedidas = pedidas.filter((m) => !fora.has(m));
          continue;
        }
        // Sem nomes na mensagem não há como saber qual métrica ofende; devolver
        // tudo indisponível é mais honesto do que remover às cegas.
        if (d.kind === 'unsupported_metric' || d.kind === 'not_available' || d.kind === 'permission_missing') {
          return { payload: { data: [] }, requested: [...metrics], unsupported: [...metrics], unavailable: d };
        }
        throw error;
      }
    }

    return { payload: { data: [] }, requested: [...metrics], unsupported: removidas.length ? removidas : [...metrics], unavailable: null };
  }

  private buildUrl(path: string, params?: Record<string, string | number | undefined>): string {
    if (path.startsWith('http')) {
      const u = new URL(path);
      u.searchParams.set('access_token', this.token);
      return u.toString();
    }
    const url = new URL(`${GRAPH_HOST}/${this.version}/${path.replace(/^\//, '')}`);
    for (const [k, v] of Object.entries(params ?? {})) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
    url.searchParams.set('access_token', this.token);
    return url.toString();
  }
}

/** O caminho sem query. É o que pode ir para um log: a query levaria o token. */
export const safePath = (path: string): string => {
  if (!path.startsWith('http')) return path.split('?')[0];
  try {
    return new URL(path).pathname;
  } catch {
    return '[url]';
  }
};
