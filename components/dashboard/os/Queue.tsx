'use client';

import { useState, useSyncExternalStore } from 'react';
import type { ActionRow } from '@/modules/actions/service';
import ActionCard from './ActionCard';

/** A fila do dia, aos poucos.
 *
 *  Quarenta cartões de uma vez são um muro: a Carol abre o Hoje para fazer a
 *  primeira coisa, não para ler tudo. Cinco por padrão, e quem quiser ver mais
 *  escolhe — a escolha fica salva, porque ninguém quer repeti-la todos os
 *  dias. */

const SIZES = [5, 10, 20] as const;
const KEY = 'carolos.queue.size';

/** A preferência vive no browser, não no React: ler no servidor dá 5 e ler no
 *  cliente dá o que ela escolheu, e é o `useSyncExternalStore` que costura as
 *  duas leituras sem desencontro de hidratação. */
let listeners: (() => void)[] = [];

const readSize = () => {
  try {
    const n = Number(localStorage.getItem(KEY));
    return SIZES.includes(n as (typeof SIZES)[number]) ? n : SIZES[0];
  } catch {
    return SIZES[0];
  }
};

const sizeStore = {
  subscribe(cb: () => void) {
    listeners.push(cb);
    return () => {
      listeners = listeners.filter((l) => l !== cb);
    };
  },
  write(n: number) {
    try {
      localStorage.setItem(KEY, String(n));
    } catch {
      /* modo privado: a escolha vale só para esta sessão */
    }
    for (const l of listeners) l();
  },
};

export default function Queue({ actions }: { actions: ActionRow[] }) {
  const size = useSyncExternalStore(sizeStore.subscribe, readSize, () => SIZES[0]);
  const [page, setPage] = useState(0);

  const pages = Math.max(1, Math.ceil(actions.length / size));
  // Mudar o tamanho pode deixar a página atual fora do fim da lista.
  const current = Math.min(page, pages - 1);
  const from = current * size;
  const slice = actions.slice(from, from + size);

  const urgent = slice.filter((a) => a.priorityScore >= 90);
  const rest = slice.filter((a) => a.priorityScore < 90);

  const choose = (n: number) => {
    setPage(0);
    sizeStore.write(n);
  };

  return (
    <>
      {urgent.length ? (
        <section className="osSection">
          <h2>{current === 0 ? 'Primeiro isto' : 'Ainda a arder'}</h2>
          <p className="osNote">Alguém está esperando por você, ou há dinheiro a arriscar-se.</p>
          <div className="osQueue">
            {urgent.map((a, i) => (
              <ActionCard key={a.id} action={a} index={i} />
            ))}
          </div>
        </section>
      ) : null}

      {rest.length ? (
        <section className="osSection">
          <h2>{urgent.length ? 'Depois' : 'A fila'}</h2>
          <div className="osQueue">
            {rest.map((a, i) => (
              <ActionCard key={a.id} action={a} index={urgent.length + i} />
            ))}
          </div>
        </section>
      ) : null}

      {actions.length > SIZES[0] ? (
        <nav className="osPager" aria-label="Páginas da fila">
          <div className="osPagerNav">
            <button
              type="button"
              className="osPageBtn"
              onClick={() => setPage(current - 1)}
              disabled={current === 0}
            >
              Anterior
            </button>
            <span className="osPagerAt">
              {from + 1}–{Math.min(from + size, actions.length)} de {actions.length}
            </span>
            <button
              type="button"
              className="osPageBtn"
              onClick={() => setPage(current + 1)}
              disabled={current >= pages - 1}
            >
              Seguinte
            </button>
          </div>

          <div className="osPagerSize">
            <span id="queueSizeLabel">Por página</span>
            <div className="osPagerSizes" role="group" aria-labelledby="queueSizeLabel">
              {SIZES.map((n) => (
                <button
                  key={n}
                  type="button"
                  className="osPageBtn"
                  aria-pressed={n === size}
                  onClick={() => choose(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </nav>
      ) : null}
    </>
  );
}
