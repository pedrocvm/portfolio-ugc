/** Quando uma chave esgota, passa-se à seguinte.
 *
 *  Cada chave do Gemini tem a sua cota. Com duas, a corrida que morria a meio da
 *  manhã acaba na segunda; sem nenhuma disponível, diz-se isso em vez de tentar
 *  às cegas e gastar uma chamada por cada tentativa.
 *
 *  Uma chave gasta fica marcada: repetir nela é queimar tempo a receber o mesmo
 *  429. A marca expira, porque a cota do dia volta e a de minuto passa depressa. */
import { failureKind, quotaWindow } from './failure';

/** Quanto tempo se deixa uma chave de lado depois de ela dizer que não pode
 *  mais. A do dia volta à meia-noite da Califórnia, que daqui não se sabe quando
 *  é ao certo; meia hora de castigo erra pouco e não prende nada. */
const REST_MS = { day: 30 * 60_000, minute: 60_000, unknown: 5 * 60_000 } as const;

type Entry<T> = { provider: T; label: string; restingUntil: number };

export type FallbackState = { spent: string[]; using: string | null };

export function withFallback<T extends object>(
  providers: { provider: T; label: string }[],
  onSwitch?: (from: string, to: string) => void,
): T {
  if (providers.length === 0) throw new Error('withFallback sem fornecedores');
  const entries: Entry<T>[] = providers.map((p) => ({ ...p, restingUntil: 0 }));
  const first = entries[0].provider;

  const available = () => entries.filter((e) => e.restingUntil <= Date.now());

  return new Proxy(first, {
    get(_target, prop, receiver) {
      const sample = Reflect.get(first, prop, receiver);
      if (typeof sample !== 'function') return sample;

      return (...args: unknown[]) => {
        // Um gerador não se refaz noutra chave a meio: já entregou pedaços.
        // Escolhe-se a chave antes de começar e fica-se com ela.
        if (prop === 'stream') {
          const pick = available()[0] ?? entries[0];
          return (Reflect.get(pick.provider, prop) as (...a: unknown[]) => unknown).apply(pick.provider, args);
        }
        return run(entries, available, prop, args, onSwitch);
      };
    },
  }) as T;
}

async function run<T extends object>(
  entries: Entry<T>[],
  available: () => Entry<T>[],
  prop: string | symbol,
  args: unknown[],
  onSwitch?: (from: string, to: string) => void,
): Promise<unknown> {
  const usable = available();
  // Todas de castigo: tenta a que descansa há mais tempo, em vez de falhar sem
  // sequer perguntar. A cota pode ter voltado antes do prazo que arbitrámos.
  const order = usable.length ? usable : [[...entries].sort((a, b) => a.restingUntil - b.restingUntil)[0]];

  let last: unknown;
  for (const [i, entry] of order.entries()) {
    try {
      const fn = Reflect.get(entry.provider, prop) as (...a: unknown[]) => Promise<unknown>;
      return await fn.apply(entry.provider, args);
    } catch (error) {
      last = error;
      const kind = failureKind(error);
      // Sem saldo é tão definitivo como sem cota, e também vale a pena tentar a
      // chave seguinte — o que não vale é insistir nesta.
      if (kind !== 'quota' && kind !== 'billing') throw error;
      entry.restingUntil = Date.now() + (kind === 'billing' ? REST_MS.day : REST_MS[quotaWindow(error)]);
      const next = order[i + 1];
      if (next) onSwitch?.(entry.label, next.label);
    }
  }
  throw last;
}

/** A pesquisa vai a uma chave, o resto vai a outra.
 *
 *  Só a descoberta usa a pesquisa Google, uma vez por corrida, e só ela precisa
 *  de um projeto com faturação ligada. As outras vinte e uma chamadas continuam
 *  no plano grátis. Encaminhar por finalidade — e não por esgotamento, como a
 *  cadeia acima — é o que impede a corrida inteira de cair no projeto que paga.
 *
 *  Sem chave de pesquisa, tudo segue como antes: a pesquisa vai à cadeia normal
 *  e falha lá, com uma frase que diz porquê em vez de falar em cota. */
export function routeSearch<T extends object>(general: T, searcher: T | null): T {
  return new Proxy(general, {
    get(target, prop, receiver) {
      if (prop !== 'search') return Reflect.get(target, prop, receiver);

      const host = searcher ?? target;
      const fn = searcher
        ? (Reflect.get(searcher, prop) as unknown)
        : Reflect.get(target, prop, receiver);
      if (typeof fn !== 'function') return fn;

      return async (...args: unknown[]) => {
        try {
          return await (fn as (...a: unknown[]) => Promise<unknown>).apply(host, args);
        } catch (error) {
          // Uma cota recusada na pesquisa quase nunca é cota: é a chave ser de um
          // projeto sem faturação. Chamar-lhe «limite de uso» manda esperar por
          // uma franquia que não existe — e é igual com chave dedicada ou sem
          // ela, porque o que falta é a faturação, não a variável.
          // Saldo esgotado já se explica sozinho: dizer que falta faturação
          // manda ligar o que já está ligado.
          if (failureKind(error) === 'quota') {
            throw new Error(
              'A pesquisa na web foi recusada. Quase sempre é a chave vir de um projeto sem faturação ligada: a pesquisa Google não existe no plano grátis.',
              { cause: error },
            );
          }
          throw error;
        }
      };
    },
  });
}
