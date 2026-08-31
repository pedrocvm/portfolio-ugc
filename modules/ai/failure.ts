/** O que correu mal com a IA, dito à Carol.
 *
 *  O SDK da Google devolve o JSON inteiro da resposta dentro de `error.message`.
 *  Dez sítios faziam `error.message` para a tela, por isso ela recebia
 *  `{"error":{"code":429,"status":"RESOURCE_EXHAUSTED",...}}` colado a meio de
 *  uma frase em português. A tradução é aqui, uma vez, à saída do fornecedor —
 *  nos chamadores era o mesmo erro dez vezes. */

export type FailureKind = 'quota' | 'key' | 'overloaded' | 'blocked' | 'offline' | 'unknown';

const raw = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error ?? '')).toLowerCase();

export function failureKind(error: unknown): FailureKind {
  const t = raw(error);
  if (/429|resource_exhausted|quota|rate.?limit/.test(t)) return 'quota';
  if (/401|403|api_key|api key|permission_denied|unauthenticated|invalid.*credential/.test(t)) return 'key';
  if (/503|500|unavailable|overloaded|internal error|deadline/.test(t)) return 'overloaded';
  if (/safety|blocked|prohibited_content|recitation/.test(t)) return 'blocked';
  if (/enotfound|econnrefused|etimedout|network|fetch failed|socket/.test(t)) return 'offline';
  return 'unknown';
}

/** Uma cota gasta por minuto passa sozinha; a do dia não. Quando o erro não diz
 *  qual foi, a frase cobre as duas em vez de escolher a errada. */
function quotaSentence(t: string): string {
  if (/per.?day|daily|requests_per_day/.test(t)) {
    return 'A IA chegou ao limite de pedidos de hoje. Recomeça amanhã de manhã.';
  }
  if (/per.?minute|requests_per_minute/.test(t)) {
    return 'Pedidos a mais em pouco tempo. Espera um minuto e tenta outra vez.';
  }
  return 'A IA chegou a um limite de uso. Espera um minuto e tenta outra vez; se continuar, é o limite do dia e recomeça amanhã.';
}

export function aiFailure(error: unknown): string {
  const t = raw(error);
  switch (failureKind(error)) {
    case 'quota':
      return quotaSentence(t);
    case 'key':
      return 'A chave da IA não foi aceite. Isto é configuração, não é nada que possas resolver daí.';
    case 'overloaded':
      return 'A IA está fora do ar neste momento. Costuma passar em minutos.';
    case 'blocked':
      return 'A IA recusou-se a responder a este pedido.';
    case 'offline':
      return 'Não consegui chegar à IA. Parece ligação.';
    default:
      return 'A IA falhou e não disse porquê.';
  }
}

const isAsyncIterable = (v: unknown): v is AsyncIterable<unknown> =>
  typeof v === 'object' && v !== null && Symbol.asyncIterator in v;

async function* wrapIteration(source: AsyncIterable<unknown>) {
  try {
    yield* source;
  } catch (e) {
    throw new Error(aiFailure(e), { cause: e });
  }
}

/** Embrulha o fornecedor para que nenhum erro dele saia em bruto. Fica no
 *  `aiSetup`, que é por onde os dois fornecedores passam. */
export function humanizeErrors<T extends object>(provider: T): T {
  return new Proxy(provider, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        try {
          const out = (value as (...a: unknown[]) => unknown).apply(target, args);
          if (out instanceof Promise) {
            return out.catch((e: unknown) => {
              throw new Error(aiFailure(e), { cause: e });
            });
          }
          // `stream` devolve um gerador: o erro só aparece ao iterar, muito
          // depois desta chamada ter voltado sem falha nenhuma.
          if (isAsyncIterable(out)) return wrapIteration(out);
          return out;
        } catch (e) {
          throw new Error(aiFailure(e), { cause: e });
        }
      };
    },
  });
}
