'use client';

import { useEffect, useSyncExternalStore } from 'react';

/** Avisos que aparecem e saem sozinhos.
 *
 *  A procura demora minutos e agora corre em segundo plano. Sem isto, ela
 *  carrega em «procurar», vai fazer outra coisa, e nunca fica a saber que
 *  acabou.
 *
 *  A loja vive no módulo, não num contexto: qualquer componente cliente chama
 *  `pushToast` sem ter de estar dentro de um provider. */

export type Toast = {
  id: number;
  text: string;
  tone: 'ok' | 'warn';
  href?: string;
  /** Presente quando a ação se desfaz. Uma ação reversível não pergunta antes;
   *  faz-se, e fica isto à mão. É o que substitui a janela de confirmação nos
   *  gestos que não saem cá para fora. */
  undo?: () => void | Promise<void>;
};

let toasts: Toast[] = [];
let listeners: (() => void)[] = [];
let seq = 0;

const emit = () => {
  toasts = [...toasts];
  for (const l of listeners) l();
};

export function pushToast(text: string, tone: Toast['tone'] = 'ok', href?: string) {
  const id = ++seq;
  toasts.push({ id, text, tone, href });
  emit();
  return id;
}

/** «Feito. Desfazer.» */
export function pushUndo(text: string, undo: Toast['undo']) {
  const id = ++seq;
  toasts.push({ id, text, tone: 'ok', undo });
  emit();
  return id;
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

const store = {
  subscribe(cb: () => void) {
    listeners.push(cb);
    return () => {
      listeners = listeners.filter((l) => l !== cb);
    };
  },
  get: () => toasts,
  // No servidor a lista está sempre vazia: nada de desencontro na hidratação.
  getServer: () => EMPTY,
};
const EMPTY: Toast[] = [];

function Item({ t }: { t: Toast }) {
  // Um aviso que fica para sempre vira mobília. Oito segundos chega para ler
  // uma linha, e o X está lá para quem não quer esperar. Com «desfazer» são
  // doze: a janela de arrependimento tem de ser maior do que a de leitura.
  useEffect(() => {
    const timer = setTimeout(() => dismissToast(t.id), t.undo ? 12000 : 8000);
    return () => clearTimeout(timer);
  }, [t.id, t.undo]);

  return (
    <div className="toast" data-tone={t.tone} role="status">
      <p>{t.text}</p>
      {t.href ? <a href={t.href}>Ver</a> : null}
      {t.undo ? (
        <button
          type="button"
          className="toastUndo"
          onClick={() => {
            dismissToast(t.id);
            void t.undo?.();
          }}
        >
          Desfazer
        </button>
      ) : null}
      <button type="button" onClick={() => dismissToast(t.id)} aria-label="Dispensar aviso">
        ×
      </button>
    </div>
  );
}

export default function Toasts() {
  const items = useSyncExternalStore(store.subscribe, store.get, store.getServer);
  if (items.length === 0) return null;
  return (
    <div className="toastHost" aria-live="polite">
      {items.map((t) => (
        <Item key={t.id} t={t} />
      ))}
    </div>
  );
}
