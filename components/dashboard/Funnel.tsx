'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { moveBrand } from '@/app/dashboard/brand-actions';
import { CLOSED, STAGES, type Brand, type Stage } from '@/lib/brands';
import Busy from './Busy';
import { useBoardDrag } from './useBoardDrag';

const DAY = 86400000;

/** Dias desde a última mexida na marca. */
const parada = (b: Brand) =>
  Math.floor((Date.now() - new Date(b.updated_at).getTime()) / DAY);

export default function Funnel({ brands }: { brands: Brand[] }) {
  const [pending, start] = useTransition();

  /* a coluna muda no ecrã à frente do servidor: arrastar tem de responder no
     instante, não daqui a um pedido */
  const [moved, setMoved] = useState<Record<string, Stage>>({});
  const router = useRouter();

  const stageOf = (b: Brand) => moved[b.id] ?? b.stage;
  const abertas = brands.filter((b) => !CLOSED.includes(stageOf(b)));

  const board = useRef<HTMLDivElement>(null);
  const drag = useBoardDrag((id, zone) => {
    const b = brands.find((x) => x.id === id);
    if (b) move(b, zone as Stage);
  }, board);
  const heldBrand = brands.find((b) => b.id === drag.held?.id);

  function move(b: Brand, to: Stage) {
    if (stageOf(b) === to) return;
    setMoved((m) => ({ ...m, [b.id]: to }));
    start(async () => {
      const r = await moveBrand(b.id, to);
      if (r.error) setMoved((m) => ({ ...m, [b.id]: b.stage }));
      router.refresh();
    });
  }

  return (
    <>
      <Busy on={pending} />
      <div className="dashBar">
        <h1>Funil de vendas</h1>
        <span className="dashState">{abertas.length} conversas abertas</span>
      </div>

      {brands.length === 0 ? (
        <p className="libEmpty">
          O funil enche-se sozinho à medida que registas marcas. Começa por
          registar a primeira em Marcas.
        </p>
      ) : (
        <div
          className="funnel"
          ref={board}
          data-dragging={drag.held?.id || undefined}
        >
          {STAGES.map((s) => {
            const col = brands.filter((b) => stageOf(b) === s.id);
            return (
              <section
                className="fnCol"
                key={s.id}
                data-stage={s.id}
                data-zone={s.id}
                data-over={drag.zone === s.id || undefined}
              >
                <header className="fnHead">
                  <span className="fnName">{s.label}</span>
                  <span className="fnCount">{col.length}</span>
                </header>

                {col.length === 0 ? (
                  <p className="fnVazio">
                    {drag.zone === s.id ? 'Larga aqui' : 'Vazio'}
                  </p>
                ) : (
                  <ul className="fnList">
                    {col.map((b) => {
                      const dias = parada(b);
                      const i = STAGES.findIndex((x) => x.id === stageOf(b));
                      return (
                        <li
                          key={b.id}
                          className="fnCard"
                          data-held={drag.held?.id === b.id || undefined}
                          onPointerDown={(e) => drag.onPointerDown(e, b.id)}
                          onPointerMove={drag.onPointerMove}
                          onPointerUp={drag.onPointerUp}
                          onPointerCancel={drag.cancel}
                        >
                          <strong>{b.name}</strong>
                          {b.next_step ? (
                            <span className="fnNext">{b.next_step}</span>
                          ) : null}
                          <span
                            className="fnDias"
                            data-alerta={
                              dias >= 14 && !CLOSED.includes(stageOf(b))
                                ? ''
                                : undefined
                            }
                          >
                            {dias === 0 ? 'hoje' : `há ${dias} dias`}
                          </span>
                          {/* o teclado precisa de um caminho próprio: arrastar
                              não chega para quem não usa rato */}
                          <div className="fnMove">
                            <button
                              type="button"
                              className="icoBtn"
                              aria-label={`Mover ${b.name} para a etapa anterior`}
                              disabled={i === 0}
                              onClick={() => move(b, STAGES[i - 1].id)}
                            >
                              ←
                            </button>
                            <button
                              type="button"
                              className="icoBtn"
                              aria-label={`Mover ${b.name} para a etapa seguinte`}
                              disabled={i === STAGES.length - 1}
                              onClick={() => move(b, STAGES[i + 1].id)}
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

      {drag.held && heldBrand ? (
        <div
          className="fnGhost"
          ref={drag.ghost}
          style={{ width: drag.held.w, height: drag.held.h }}
          aria-hidden="true"
        >
          <strong>{heldBrand.name}</strong>
          {heldBrand.next_step ? (
            <span className="fnNext">{heldBrand.next_step}</span>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
