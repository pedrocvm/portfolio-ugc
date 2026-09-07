'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

const MENOS = '(prefers-reduced-motion: reduce)';
const ouvir = (avisa: () => void) => {
  const mq = window.matchMedia(MENOS);
  mq.addEventListener('change', avisa);
  return () => mq.removeEventListener('change', avisa);
};

/** Carrossel horizontal com scroll nativo: paginação, estado das setas e,
 *  quando lhe dão um intervalo, avanço sozinho. */
export function useReel(autoMs = 0) {
  const ref = useRef<HTMLUListElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  /* a preferência do sistema decide o arranque; um toque nos comandos vale
     mais do que ela, porque aí o movimento foi pedido de propósito */
  const [querAuto, setAuto] = useState<boolean | null>(null);
  const menosMovimento = useSyncExternalStore(
    ouvir,
    () => window.matchMedia(MENOS).matches,
    () => false,
  );
  const auto = autoMs > 0 && (querAuto ?? !menosMovimento);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth - 2;
    setAtStart(el.scrollLeft <= 2);
    setAtEnd(el.scrollLeft >= max);
  }, []);

  const page = useCallback((dir: number) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({
      left: dir * el.clientWidth,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
    });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [update]);

  useEffect(() => {
    const el = ref.current;
    if (!auto || !el) return;
    /* o relógio pára enquanto o rato está em cima ou o foco está lá dentro:
       ninguém quer ver a fila fugir enquanto olha para uma foto */
    let quieto = false;
    const escutas = [
      ['pointerenter', () => (quieto = true)],
      ['focusin', () => (quieto = true)],
      ['pointerleave', () => (quieto = false)],
      ['focusout', () => (quieto = false)],
    ] as const;
    escutas.forEach(([nome, f]) => el.addEventListener(nome, f));
    const relogio = setInterval(() => {
      if (quieto || document.hidden) return;
      if (el.scrollLeft >= el.scrollWidth - el.clientWidth - 2)
        el.scrollTo({ left: 0, behavior: 'smooth' });
      else page(1);
    }, autoMs);
    return () => {
      clearInterval(relogio);
      escutas.forEach(([nome, f]) => el.removeEventListener(nome, f));
    };
  }, [auto, autoMs, page]);

  return { reelRef: ref, atStart, atEnd, page, update, auto, setAuto };
}
