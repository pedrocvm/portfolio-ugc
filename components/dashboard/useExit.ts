'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Mantém o elemento montado enquanto a animação de saída corre. Sem isto o
 *  React desmonta ao primeiro clique e a saída nunca chega a ver-se.
 *
 *  Duas coisas que faltavam, e que se viam no menu do celular: abria bem à
 *  primeira e, a partir daí, abria e fechava-se sozinho.
 *
 *  A primeira é repor o `closing`. Ficava `true` para sempre depois do primeiro
 *  fecho, por isso a abertura seguinte nascia já com o estado de saída.
 *
 *  A segunda é o `onDone`. Vinha como função nova a cada render e estava nas
 *  dependências do efeito, portanto qualquer render enquanto fechava cancelava
 *  o temporizador e agendava outro — e um render enquanto `closing` era `true`
 *  bastava para fechar um painel acabado de abrir. Fica numa ref: o efeito
 *  passa a depender só do que é dele. */
export function useExit(onDone: () => void, ms = 220) {
  const [closing, setClosing] = useState(false);
  const done = useRef(onDone);
  done.current = onDone;

  const close = useCallback(() => setClosing(true), []);

  useEffect(() => {
    if (!closing) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = setTimeout(() => {
      setClosing(false);
      done.current();
    }, reduce ? 0 : ms);
    return () => clearTimeout(t);
  }, [closing, ms]);

  return { closing, close };
}
