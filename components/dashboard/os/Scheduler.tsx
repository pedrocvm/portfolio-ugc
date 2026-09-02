'use client';

import { useState, useTransition } from 'react';
import Spinner from '@/components/dashboard/Spinner';
import { setUpScheduler, stopScheduler } from '@/app/dashboard/carolos-actions';
import { formatDate, relativeDays } from '@/lib/time';
import {
  DISPATCH_LABEL, DISPATCH_TONE, JOB_PURPOSE, readSchedule,
  type ScheduleRow, type SchedulerState,
} from '@/modules/jobs/domain';

/** O agendador.
 *
 *  Vive no Supabase e não na Vercel: o plano Hobby só permite um cron por dia,
 *  e o Gmail precisa ser visto de quinze em quinze minutos. Aqui só se liga,
 *  se desliga e se vê se está rodando. */

export default function Scheduler({ state }: { state: SchedulerState }) {
  const [, start] = useTransition();
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  // Aplicar o horário fala com o Postgres e com o Vault: demora o suficiente
  // para o clique parecer perdido sem nada a girar.
  const [running, setRunning] = useState<'apply' | 'stop' | null>(null);
  const pending = running !== null;

  const run = (id: 'apply' | 'stop', work: () => Promise<void>) => {
    // Ver a nota em Settings: dentro da transição o spinner nunca chega a
    // aparecer, porque a transição mantém a tela anterior de pé.
    setRunning(id);
    start(async () => {
      try {
        await work();
      } finally {
        setRunning(null);
      }
    });
  };

  if (!state.available) {
    return (
      <section className="osSection">
        <h2>Agendador</h2>
        <p className="osWarn" data-tone="info">
          {state.unavailableReason ??
            'Não com você falar com o agendador. Verifique as migrações e a chave de service role.'}
        </p>
      </section>
    );
  }

  const broken = state.rows.filter((r) => r.failures24h > 0);

  return (
    <section className="osSection">
      <h2>Agendador</h2>
      <p className="osNote">
        Os trabalhos correm no Supabase, não na Vercel — o plano Hobby só deixa um cron por dia, e o
        Gmail precisa ser visto muito mais vezes do que isso. Nada aqui depende de abrir a
        aplicação.
      </p>
      {state.configured ? (
        <p className="osNote">
          Já está rodando sozinho. Só precisa voltar aqui quando o CarolOS tiver trabalhos
          novos — «atualizar a lista» põe-nos no relógio.
        </p>
      ) : null}

      {!state.configured ? (
        <p className="osWarn" data-tone="info">
          O agendador está montado mas ainda não sabe para onde ligar. Clique em ligar: o endereço
          e o segredo saem do ambiente — o segredo vai para o cofre do Supabase e nunca mais sai de lá.
        </p>
      ) : (
        <div className="osStats" style={{ marginBottom: 18 }}>
          <div className="osStat">
            <b><em>{state.rows.filter((r) => r.active).length}</em></b>
            <span>trabalhos ativos</span>
          </div>
          <div className="osStat">
            <b><em>{state.baseUrl?.replace(/^https?:\/\//, '') ?? '—'}</em></b>
            <span>endereço chamado</span>
          </div>
          <div className="osStat">
            <b><em>{state.configuredAt ? formatDate(state.configuredAt) : '—'}</em></b>
            <span>ligado em</span>
          </div>
        </div>
      )}

      {broken.length ? (
        <p className="osWarn">
          {broken.length === 1 ? 'Um trabalho falhou' : `${broken.length} trabalhos falharam`} nas
          últimas 24 horas. Depois de algumas falhas seguidas o sistema recua sozinho em vez de
          insistir — um 401 espera uma hora, porque é configuração e não indisposição.
        </p>
      ) : null}

      <div className="osActs">
        <button
          className="btn"
          type="button"
          disabled={pending}
          onClick={() =>
            run('apply', async () => {
              setError('');
              setMessage('');
              const result = await setUpScheduler();
              if (result.error) return setError(result.error);
              setMessage(`Agendador ligado, com ${result.jobs} trabalhos.`);
            })
          }
        >
          {running === 'apply' ? <Spinner label="Aplicando o horário" /> : null}
          {/* «aplicar de novo o horário» não diz o que faz nem quando serve.
              O que o botão faz é pôr no relógio a lista de trabalhos que esta
              versão do CarolOS tem — e isso só interessa depois de haver
              trabalhos novos. */}
          {state.configured ? 'Atualizar a lista de trabalhos' : 'Ligar o agendador'}
        </button>
        {state.configured ? (
          <button
            className="chip"
            type="button"
            disabled={pending}
            onClick={() =>
              run('stop', async () => {
                setError('');
                setMessage('');
                const result = await stopScheduler();
                if (result.error) return setError(result.error);
                setMessage(`${result.jobs} trabalhos desagendados.`);
              })
            }
          >
            {running === 'stop' ? <Spinner label="Parando" /> : null}
            Parar tudo
          </button>
        ) : null}
      </div>

      {error ? <p className="osWarn" role="alert">{error}</p> : null}
      {message ? <p className="osWarn" data-tone="ok">{message}</p> : null}

      {state.rows.length ? (
        <div className="osRows" style={{ marginTop: 18 }}>
          {state.rows.map((r) => <Row key={r.jobName} row={r} />)}
        </div>
      ) : (
        <p className="osRowSub" style={{ marginTop: 14 }}>
          Nenhum trabalho agendado. Clique em ligar.
        </p>
      )}
    </section>
  );
}

function Row({ row }: { row: ScheduleRow }) {
  const purpose = JOB_PURPOSE[row.jobName];

  return (
    <div className="osRow">
      <div>
        <span className="osRowName" style={{ fontSize: 17 }}>
          {purpose?.label ?? row.jobName}
        </span>
        <p className="osRowSub">
          {readSchedule(row.schedule)}
          {purpose ? ` · ${purpose.why}` : ''}
        </p>
        {row.lastError ? <p className="osRowSub">Último erro: {row.lastError}</p> : null}
      </div>
      <div className="osRowSide">
        {!row.active ? <span className="osTag" data-tone="mute">parado</span> : null}
        {row.lastStatus ? (
          <span className="osTag" data-tone={DISPATCH_TONE[row.lastStatus] ?? 'mute'}>
            {DISPATCH_LABEL[row.lastStatus] ?? row.lastStatus}
          </span>
        ) : (
          <span className="osTag" data-tone="mute">ainda não correu</span>
        )}
        {row.processedCount !== null && row.processedCount > 0 ? (
          <span>{row.processedCount} item(ns)</span>
        ) : null}
        {row.lastDispatch ? <span>{relativeDays(row.lastDispatch)}</span> : null}
        {row.failures24h > 0 ? (
          <span className="osTag" data-tone="bad">{row.failures24h} falha(s) em 24h</span>
        ) : null}
      </div>
    </div>
  );
}
