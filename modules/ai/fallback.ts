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
      if (failureKind(error) !== 'quota') throw error;
      entry.restingUntil = Date.now() + REST_MS[quotaWindow(error)];
      const next = order[i + 1];
      if (next) onSwitch?.(entry.label, next.label);
    }
  }
  throw last;
}
