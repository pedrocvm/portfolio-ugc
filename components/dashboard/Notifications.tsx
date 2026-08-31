'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { Notification } from '@/modules/assistant/service';

/** O que precisa dela, em qualquer ecrã.
 *
 *  O Hoje é a casa da fila, mas ela passa o dia dentro de uma marca ou de um
 *  documento — e o que está atrasado não deixa de estar atrasado por ela ter
 *  mudado de página. Isto fica fixo no topo e não muda de sítio.
 *
 *  O que já passou do prazo vem primeiro, porque é trabalho concreto; os avisos
 *  do negócio vêm a seguir, porque são coisas a começar a doer. */
export default function Notifications({ items }: { items: Notification[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onOutside = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (t && box.current && !box.current.contains(t)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onOutside);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onOutside);
    };
  }, [open]);

  const urgent = items.filter((i) => i.severity === 'urgent').length;

  return (
    <div className="notif" ref={box}>
      <button
        className="notifBell"
        type="button"
        aria-expanded={open}
        aria-label={
          items.length === 0
            ? 'Nada precisa de ti'
            : `${items.length} ${items.length === 1 ? 'coisa precisa' : 'coisas precisam'} de ti`
        }
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M18.4 16.6H5.6c1-1.1 1.5-2.5 1.5-4v-2.4a4.9 4.9 0 0 1 9.8 0v2.4c0 1.5.5 2.9 1.5 4Z" />
          <path d="M10.2 19.4a2 2 0 0 0 3.6 0" />
        </svg>
        {items.length ? (
          <span className="notifCount" data-urgent={urgent > 0 || undefined}>
            {items.length > 9 ? '9+' : items.length}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="notifBox" role="dialog" aria-label="O que precisa de ti">
          <header>
            <b>Precisa de ti</b>
            <Link href="/dashboard" onClick={() => setOpen(false)}>
              Ver o dia
            </Link>
          </header>

          {items.length === 0 ? (
            <p className="notifEmpty">Nada em atraso e nenhum aviso aberto. Está tudo em dia.</p>
          ) : (
            <ul>
              {items.map((i) =>
                i.href ? (
                  <li key={i.id}>
                    <Link href={i.href} data-sev={i.severity} onClick={() => setOpen(false)}>
                      <b>{i.title}</b>
                      <span>{i.detail}</span>
                    </Link>
                  </li>
                ) : (
                  <li key={i.id}>
                    <div data-sev={i.severity}>
                      <b>{i.title}</b>
                      <span>{i.detail}</span>
                    </div>
                  </li>
                ),
              )}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
