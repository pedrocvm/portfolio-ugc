'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { moveBrand } from '@/app/dashboard/brand-actions';
import { CLOSED, STAGES, type Brand, type Stage } from '@/lib/brands';

const DAY = 86400000;

/** Dias desde a última mexida na marca. */
const parada = (b: Brand) =>
  Math.floor((Date.now() - new Date(b.updated_at).getTime()) / DAY);

export default function Funnel({ brands }: { brands: Brand[] }) {
  const [pending, start] = useTransition();
  const router = useRouter();

  const abertas = brands.filter((b) => !CLOSED.includes(b.stage));

  function move(b: Brand, dir: number) {
    const i = STAGES.findIndex((s) => s.id === b.stage);
    const next = STAGES[i + dir];
    if (!next) return;
    start(async () => {
      await moveBrand(b.id, next.id);
      router.refresh();
    });
  }

  return (
    <>
      <div className="dashBar">
        <h1>Funil de vendas</h1>
        <span className="dashState">
          {pending ? 'A processar…' : `${abertas.length} conversas abertas`}
        </span>
      </div>

      {brands.length === 0 ? (
        <p className="libEmpty">
          O funil enche-se sozinho à medida que registas marcas. Começa por
          registar a primeira em Marcas.
        </p>
      ) : (
        <div className="funnel">
          {STAGES.map((s) => {
            const col = brands.filter((b) => b.stage === s.id);
            return (
              <section className="fnCol" key={s.id} data-stage={s.id}>
                <header className="fnHead">
                  <span className="mono">{s.label}</span>
                  <span className="fnCount">{col.length}</span>
                </header>
                {col.length === 0 ? (
                  <p className="fnVazio">Vazio</p>
                ) : (
                  <ul className="fnList">
                    {col.map((b) => {
                      const dias = parada(b);
                      return (
                        <li key={b.id} className="fnCard">
                          <strong>{b.name}</strong>
                          {b.next_step ? (
                            <span className="fnNext">{b.next_step}</span>
                          ) : null}
                          <span
                            className="fnDias"
                            data-alerta={
                              dias >= 14 && !CLOSED.includes(s.id as Stage)
                                ? ''
                                : undefined
                            }
                          >
                            {dias === 0 ? 'hoje' : `há ${dias} dias`}
                          </span>
                          <div className="fnMove">
                            <button
                              type="button"
                              className="icoBtn"
                              aria-label="Etapa anterior"
                              disabled={s.id === STAGES[0].id || pending}
                              onClick={() => move(b, -1)}
                            >
                              ←
                            </button>
                            <button
                              type="button"
                              className="icoBtn"
                              aria-label="Etapa seguinte"
                              disabled={
                                s.id === STAGES[STAGES.length - 1].id || pending
                              }
                              onClick={() => move(b, 1)}
                            >
                              →
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
