'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { dismiss, doneAction, reopenAction, snooze } from '@/app/dashboard/carolos-actions';
import { pushUndo } from '@/components/dashboard/Toasts';
import Spinner from '@/components/dashboard/Spinner';
import type { ActionRow } from '@/modules/actions/service';
import { STAGE_LABEL, type Stage } from '@/modules/opportunities/domain';

/** O cartão do Hoje. Uma decisão por cartão.
 *
 *  Antes eram quatro botões com o mesmo peso — abrir, feito, adiar, dispensar —
 *  e escolher entre quatro coisas iguais é trabalho. Agora há um botão que é a
 *  ação, um que é o fim, e o resto dobrado atrás de «mais». */

const RISK_LABEL: Record<string, string> = {
  low: 'atenção',
  medium: 'risco',
  high: 'risco alto',
};

const SNOOZE = [
  { days: 1, label: 'amanhã' },
  { days: 3, label: 'daqui a 3 dias' },
  { days: 7, label: 'para a semana' },
];

function due(dueAt: string | null) {
  if (!dueAt) return null;
  const days = Math.round((new Date(dueAt).getTime() - Date.now()) / 86400000);
  if (days < -1) return { text: `${-days} dias de atraso`, late: true };
  if (days === -1) return { text: 'devia ter sido ontem', late: true };
  if (days === 0) return { text: 'é hoje', late: true };
  if (days === 1) return { text: 'amanhã', late: false };
  return { text: `daqui a ${days} dias`, late: false };
}

export default function ActionCard({ action, index }: { action: ActionRow; index: number }) {
  const [pending, start] = useTransition();
  const [running, setRunning] = useState('');
  const [gone, setGone] = useState(false);
  const [error, setError] = useState('');

  if (gone) return null;

  /** Nenhuma destas três pergunta antes: são todas reversíveis, e nenhuma sai
   *  cá para fora. O cartão sai da tela e fica um «desfazer» num aviso, que é
   *  menos fricção do que uma janela por cartão e protege o mesmo. */
  const run = (id: string, etiqueta: string, fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      setRunning(id);
      const result = await fn();
      setRunning('');
      if (result.error) {
        setError(result.error);
        return;
      }
      setGone(true);
      pushUndo(etiqueta, async () => {
        await reopenAction(action.id);
        setGone(false);
      });
    });

  const when = due(action.dueAt);
  const target = action.opportunityId
    ? `/dashboard/opportunities/${action.opportunityId}`
    : action.brandId
      ? `/dashboard/brands/${action.brandId}`
      : '/dashboard/settings';

  return (
    <article className="osCard" data-risk={action.risk} style={{ '--r': index } as React.CSSProperties}>
      <header className="osCardTop">
        <span className="osBrand">{action.brandName}</span>
        <div className="osCardFlags">
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
      </header>

      <h3>{action.title}</h3>
      <p className="osWhy">{action.reason}</p>

      {/* «Precisa da sua aprovação» saiu: estava em todos os cartões de uma
          secção chamada «Precisa de si». Um rótulo que nunca varia não
          distingue nada — só ocupa a linha por onde os olhos passam a caminho
          do botão. */}
      {action.stage ? (
        <div className="osMeta">
          <span>
            etapa <b>{STAGE_LABEL[action.stage as Stage] ?? action.stage}</b>
          </span>
        </div>
      ) : null}

      {error ? (
        <p className="osWarn" role="alert">
          {error}
        </p>
      ) : null}

      <footer className="osCardActs">
        <Link className="osGo" href={target}>
          {action.cta}
        </Link>

        <button
          className="osPageBtn"
          type="button"
          disabled={pending}
          onClick={() => run('done', `«${action.title}» dado como feito.`, () => doneAction(action.id))}
        >
          {running === 'done' ? <Spinner label="A marcar" /> : null}
          Já está
        </button>

        {/* <details> nativo: um menu sem estado, sem JS e com teclado de graça. */}
        <details className="osMore">
          <summary aria-label="Mais opções">⋯</summary>
          <div className="osMoreBox">
            <span className="osMoreLabel">Adiar para</span>
            {SNOOZE.map((s) => (
              <button
                key={s.days}
                type="button"
                disabled={pending}
                onClick={() =>
                  run(`snooze${s.days}`, `«${action.title}» volta ${s.label}.`, () =>
                    snooze(action.id, s.days),
                  )
                }
              >
                {s.label}
              </button>
            ))}
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run('dismiss', `«${action.title}» saiu da fila.`, () => dismiss(action.id))
              }
            >
              Não é preciso
            </button>
          </div>
        </details>
      </footer>
    </article>
  );
}
