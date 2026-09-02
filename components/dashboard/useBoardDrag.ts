'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const HOLD_MS = 220;
const SLOP = 8;
const EDGE = 56;
const SPEED = 14;

type Held = { id: string; dx: number; dy: number; w: number; h: number };

/** Arrastar com Pointer Events: o Safari do iPhone não dispara eventos de
 *  drag em toque, por isso o arrastar nativo do HTML5 não serve de nada num
 *  celular. No dedo o arrasto só começa depois de uma pausa curta, senão
 *  roubava o gesto de scroll ao tabuleiro. */
export function useBoardDrag(
  onDrop: (id: string, zone: string) => void,
  scroller?: React.RefObject<HTMLElement | null>,
) {
  const [held, setHeld] = useState<Held | null>(null);
  const [zone, setZone] = useState<string | null>(null);

  const ghost = useRef<HTMLDivElement>(null);
  const pos = useRef({ x: 0, y: 0 });
  const grip = useRef({ dx: 0, dy: 0 });
  const timer = useRef<number | null>(null);
  const armed = useRef<string | null>(null);
  const start = useRef({ x: 0, y: 0 });

  const stop = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    armed.current = null;
    setHeld(null);
    setZone(null);
  }, []);

  useEffect(() => () => stop(), [stop]);

  const zoneAt = (x: number, y: number) =>
    (document.elementFromPoint(x, y)?.closest('[data-zone]') as HTMLElement | null)
      ?.dataset.zone ?? null;

  /* Enquanto arrasta: coloca o fantasma, marca a coluna sob o dedo e, se o
     dedo estiver junto à borda, empurra o tabuleiro. Sem isto não se alcança
     uma coluna que esteja fora da tela, que no celular é quase sempre.
     O ciclo vive num efeito e não numa função que se agenda a si própria. */
  useEffect(() => {
    if (!held) return;
    let raf = 0;
    const passo = () => {
      const { x, y } = pos.current;
      if (ghost.current) {
        ghost.current.style.transform = `translate3d(${x - held.dx}px, ${
          y - held.dy
        }px, 0)`;
      }
      const box = scroller?.current;
      if (box) {
        const r = box.getBoundingClientRect();
        const esq = x - r.left;
        const dir = r.right - x;
        if (esq < EDGE) box.scrollLeft -= SPEED * (1 - Math.max(esq, 0) / EDGE);
        else if (dir < EDGE) {
          box.scrollLeft += SPEED * (1 - Math.max(dir, 0) / EDGE);
        }
      }
      setZone(zoneAt(x, y));
      raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [held, scroller]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>, id: string) => {
      if (e.button !== 0) return;
      const el = e.currentTarget;
      const r = el.getBoundingClientRect();
      const pointerId = e.pointerId;
      start.current = { x: e.clientX, y: e.clientY };
      pos.current = { x: e.clientX, y: e.clientY };
      grip.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      armed.current = id;

      const begin = () => {
        if (armed.current !== id) return;
        try {
          el.setPointerCapture(pointerId);
        } catch {
          /* o ponteiro pode já ter saído; arrastar continua funcionando */
        }
        setHeld({
          id,
          dx: grip.current.dx,
          dy: grip.current.dy,
          w: r.width,
          h: r.height,
        });
      };

      if (e.pointerType === 'mouse') begin();
      else timer.current = window.setTimeout(begin, HOLD_MS);
    },
    [],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      pos.current = { x: e.clientX, y: e.clientY };
      if (held) {
        e.preventDefault();
        return;
      }
      if (!armed.current) return;
      const d = Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y);
      if (d > SLOP) stop();
    },
    [held, stop],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (held) {
        const target = zoneAt(e.clientX, e.clientY);
        if (target) onDrop(held.id, target);
      }
      stop();
    },
    [held, onDrop, stop],
  );

  return { held, zone, ghost, onPointerDown, onPointerMove, onPointerUp, cancel: stop };
}
