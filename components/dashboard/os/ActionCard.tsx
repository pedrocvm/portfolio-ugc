'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { dismiss, doneAction, snooze } from '@/app/dashboard/carolos-actions';
import type { ActionRow } from '@/modules/actions/service';

/** O cartão do Hoje. Uma decisão por cartão: o que aconteceu, porquê importa,
 *  e um botão principal. Tudo o resto é secundário e fica em texto pequeno. */

const RISK_LABEL: Record<string, string> = {
  low: 'atenção',
  medium: 'risco',
  high: 'risco alto',
};

function due(dueAt: string | null) {
  if (!dueAt) return null;
  const days = Math.round((new Date(dueAt).getTime() - Date.now()) / 86400000);
  if (days < -1) return { text: `há ${-days} dias`, late: true };
  if (days === -1) return { text: 'ontem', late: true };
  if (days === 0) return { text: 'hoje', late: true };
  if (days === 1) return { text: 'amanhã', late: false };
  return { text: `em ${days} dias`, late: false };
}

export default function ActionCard({ action, index }: { action: ActionRow; index: number }) {
  const [pending, start] = useTransition();
  const [gone, setGone] = useState(false);
  const [error, setError] = useState('');

  if (gone) return null;

  const run = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
      else setGone(true);
    });

  const when = due(action.dueAt);
  const target = action.opportunityId
    ? `/dashboard/opportunities/${action.opportunityId}`
    : action.brandId
      ? `/dashboard/brands/${action.brandId}`
      : '/dashboard/settings';

  return (
    <article className="osCard" data-risk={action.risk} style={{ '--r': index } as React.CSSProperties}>
      <div className="osCardMain">
        <div className="osCardTop">
          <span className="osBrand">{action.brandName}</span>
          {action.risk !== 'none' ? (
            <span className="osTag" data-tone={action.risk === 'high' ? 'bad' : 'hot'}>
              {RISK_LABEL[action.risk]}
            </span>
          ) : null}
          {when ? (
            <span className="osDue" data-late={when.late ? '1' : undefined}>
              {when.text}
            </span>
          ) : null}
        </div>

        <h3>{action.title}</h3>
        <p className="osWhy">{action.reason}</p>

        <div className="osMeta">
          {action.stage ? <span>etapa <b>{action.stage}</b></span> : null}
          {action.requiresApproval ? <span>precisa da tua aprovação</span> : null}
          <span>prioridade <b>{action.priorityScore}</b></span>
        </div>

        {error ? <p className="osWarn" role="alert">{error}</p> : null}
      </div>

      <div className="osCardActs">
        <Link className="btn" href={target}>
          {action.cta}
        </Link>
        <button className="chip" type="button" disabled={pending} onClick={() => run(() => doneAction(action.id))}>
          Feito
        </button>
        <button className="chip" type="button" disabled={pending} onClick={() => run(() => snooze(action.id, 3))}>
          Adiar 3 dias
        </button>
        <button className="chip" type="button" disabled={pending} onClick={() => run(() => dismiss(action.id))}>
          Não é preciso
        </button>
      </div>
    </article>
  );
}
