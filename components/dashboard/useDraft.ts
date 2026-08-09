'use client';

import { useEffect, useRef } from 'react';

/**
 * Guarda no `localStorage` o que ainda não foi gravado no servidor, para que
 * atualizar a página — ou até fechar o browser — não apague o que a pessoa
 * escreveu. Restaura ao voltar e limpa mal deixe de haver alterações por gravar.
 *
 * Só restaura se o rascunho local tiver partido do mesmo ponto que o servidor
 * nos dá agora: se entretanto o rascunho mudou noutro lado (ou foi reposto), o
 * que está guardado aqui está velho e é descartado em vez de sobrepor.
 */
export function usePersistentDraft<T>(opts: {
  key: string;
  /** O que já está gravado no servidor: o ponto de partida desta sessão. */
  base: T;
  /** O estado atual do formulário. */
  value: T;
  /** Há alterações por gravar? */
  dirty: boolean;
  /** Chamado uma vez, ao montar, se houver um rascunho local para repor. */
  onRestore: (draft: T) => void;
}) {
  const { key, base, value, dirty, onRestore } = opts;

  const ready = useRef(false);

  useEffect(() => {
    ready.current = true;
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(key);
    } catch {
      return; // modo privado ou storage bloqueado: seguimos sem repor
    }
    if (!raw) return;

    try {
      const saved = JSON.parse(raw) as { base: unknown; draft: T };
      if (JSON.stringify(saved.base) !== JSON.stringify(base)) {
        // o servidor já não está onde este rascunho começou: descarta-o
        localStorage.removeItem(key);
        return;
      }
      if (JSON.stringify(saved.draft) === JSON.stringify(base)) {
        // igual ao gravado: não há nada de novo para repor
        localStorage.removeItem(key);
        return;
      }
      onRestore(saved.draft);
    } catch {
      try {
        localStorage.removeItem(key);
      } catch {
        /* nada a fazer */
      }
    }
    // corre uma vez, com a base do arranque; não deve repetir a cada render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // não tocamos no storage antes da restauração ter tido a sua vez
    if (!ready.current) return;
    try {
      if (dirty) {
        localStorage.setItem(key, JSON.stringify({ base, draft: value }));
      } else {
        localStorage.removeItem(key);
      }
    } catch {
      /* sem espaço ou storage indisponível: seguimos sem cópia local */
    }
  }, [key, base, value, dirty]);
}
