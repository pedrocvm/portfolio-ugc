'use client';

import { useTransition } from 'react';
import { replan } from '@/app/dashboard/carolos-actions';

/** Recalcular à mão existe porque o cron pode não estar ligado — e uma fila
 *  desatualizada é pior do que uma fila vazia. */
export default function Replan() {
  const [pending, start] = useTransition();
  return (
    <button className="chip" type="button" disabled={pending} onClick={() => start(() => replan().then(() => undefined))}>
      {pending ? 'A recalcular…' : 'Recalcular fila'}
    </button>
  );
}
