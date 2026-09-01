/** Não gastar a cota grátis, e não desistir por causa dela.
 *
 *  Uma corrida de prospecção faz até 36 chamadas: a descoberta, mais uma
 *  pesquisa por marca, mais um email por finalista. O plano grátis do Gemini
 *  conta pedidos por minuto, e 36 seguidas não cabem lá. Antes disto, a
 *  chamada 16 levava 429 e a corrida inteira morria — depois de já ter gasto as
 *  quinze anteriores.
 *
 *  Duas coisas, no mesmo sítio por onde já passam todas as chamadas: espaçar,
 *  para não bater no limite; e repetir quando se bate, porque um limite por
 *  minuto passa sozinho. */
import { failureKind, quotaWindow, retryAfterMs } from './failure';

/** 15 pedidos por minuto é um a cada 4s. A margem é para o relógio deles não
 *  coincidir com o nosso. */
export const MIN_GAP_MS = 4_500;

/** A chave de pesquisa vem de um projeto com faturação ligada, onde o tecto por
 *  minuto é outra ordem de grandeza. Espaçá-la como se fosse grátis punha 90
 *  segundos de espera numa corrida que já tem pouca folga. */
export const PAID_GAP_MS = 1_200;
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [6_000, 20_000];

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason); }, { once: true });
  });

// ponytail: uma fila por processo. Duas instâncias na Vercel podem passar o
// dobro dos pedidos; se isso vier a doer, o contador tem de sair daqui para
// fora (Postgres ou Redis). Para uma pessoa a usar isto, chega.
type Gate = { queue: Promise<unknown>; lastStart: number; gap: number };

/** Uma fila por chave, não uma por processo. Cada chave tem a sua cota; com uma
 *  fila partilhada, duas chaves andariam ao ritmo de uma. */
function scheduled<T>(
  gate: Gate,
  work: (signal?: AbortSignal) => Promise<T>,
  signal?: AbortSignal,
  resetTimeout?: () => void,
): Promise<T> {
  const turn = gate.queue.then(async () => {
    const wait = gate.lastStart + gate.gap - Date.now();
    if (wait > 0) await sleep(wait, signal);
    gate.lastStart = Date.now();
    // O tempo-limite mede o modelo, não a fila. Sem isto, uma chamada que
    // esperou quarenta segundos pela vez chegava ao fornecedor com cinco
    // segundos de orçamento e abortava sem ter feito nada — e numa corrida de
    // cinquenta chamadas isso acontecia a quase todas.
    resetTimeout?.();
    return work(signal);
  });
  // A fila não pode partir-se com uma falha: a chamada seguinte ainda espera vez.
  gate.queue = turn.then(() => undefined, () => undefined);
  return turn;
}

/** Vale a pena repetir? Uma cota do dia não passa por esperar, e uma chave
 *  errada não se corrige sozinha. */
function retryable(error: unknown): boolean {
  const kind = failureKind(error);
  if (kind === 'overloaded') return true;
  return kind === 'quota' && quotaWindow(error) !== 'day';
}

async function attempt<T>(
  gate: Gate,
  work: (signal?: AbortSignal) => Promise<T>,
  signal?: AbortSignal,
  resetTimeout?: () => void,
): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await scheduled(gate, work, signal, resetTimeout);
    } catch (error) {
      if (i >= MAX_ATTEMPTS - 1 || !retryable(error)) throw error;
      await sleep(retryAfterMs(error) ?? BACKOFF_MS[i] ?? 20_000, signal);
    }
  }
}

/** Espaça as chamadas e repete as que valem a pena. Fica por dentro da tradução
 *  de erros, para ver o 429 em bruto antes de virar frase. */
export function paced<T extends object>(provider: T, gap = MIN_GAP_MS): T {
  const gate: Gate = { queue: Promise.resolve(), lastStart: 0, gap };
  return new Proxy(provider, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;

      return (...args: unknown[]) => {
        const input = args[0] as { signal?: AbortSignal; resetTimeout?: () => void } | undefined;
        const signal = input?.signal;
        const call = () => (value as (...a: unknown[]) => unknown).apply(target, args);

        // Um gerador já entregou pedaços quando falha: repeti-lo duplicava-os.
        // Espera a vez, mas não se repete.
        if (prop === 'stream') return streamAfterTurn(gate, call, signal, input?.resetTimeout);
        return attempt(gate, async () => call() as Promise<unknown>, signal, input?.resetTimeout);
      };
    },
  });
}

async function* streamAfterTurn(
  gate: Gate,
  call: () => unknown,
  signal?: AbortSignal,
  resetTimeout?: () => void,
) {
  const source = await scheduled(gate, async () => call() as AsyncIterable<unknown>, signal, resetTimeout);
  yield* source;
}
