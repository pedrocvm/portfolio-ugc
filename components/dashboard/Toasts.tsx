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

export type Toast = { id: number; text: string; tone: 'ok' | 'warn'; href?: string };

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
  // uma linha, e o X está lá para quem não quer esperar.
  useEffect(() => {
    const timer = setTimeout(() => dismissToast(t.id), 8000);
    return () => clearTimeout(timer);
  }, [t.id]);

  return (
    <div className="toast" data-tone={t.tone} role="status">
      <p>{t.text}</p>
      {t.href ? <a href={t.href}>Ver</a> : null}
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
