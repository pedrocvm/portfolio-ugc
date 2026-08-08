'use client';

import { useCallback, useEffect, useState } from 'react';

/** Mantém o elemento montado enquanto a animação de saída corre. Sem isto o
 *  React desmonta ao primeiro clique e a saída nunca chega a ver-se. */
export function useExit(onDone: () => void, ms = 220) {
  const [closing, setClosing] = useState(false);

  const close = useCallback(() => setClosing(true), []);

  useEffect(() => {
    if (!closing) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = setTimeout(onDone, reduce ? 0 : ms);
    return () => clearTimeout(t);
  }, [closing, onDone, ms]);

  return { closing, close };
}
