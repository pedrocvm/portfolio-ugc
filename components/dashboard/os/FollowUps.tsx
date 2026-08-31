'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { followUpSent, followUpSnooze } from '@/app/dashboard/carolos-actions';
import { formatDate, relativeDays } from '@/lib/time';
import { SITUATION_LABEL, type Situation } from '@/modules/followups/policy';
import type { FollowUpRow } from '@/modules/followups/service';

/** Follow-ups. A Carol nunca precisa de perguntar «já é altura?»: a data vem
 *  da regra e do que a marca prometeu.
 *
 *  A sequência acaba. Depois de dois, passa a nurture — insistir uma terceira
 *  vez é ruído, e o Handoff é claro em que ela odeia parecer chata. */

function Item({ row }: { row: FollowUpRow }) {
  const [pending, start] = useTransition();
  const [gone, setGone] = useState(false);
  if (gone) return null;

  return (
    <article className="osCard">
      <div className="osCardMain">
        <div className="osCardTop">
          <span className="osBrand">{row.brandName}</span>
          <span className="osTag" data-tone="mute">
            {SITUATION_LABEL[row.situation as Situation] ?? row.situation}
          </span>
          <span className="osTag" data-tone="mute">#{row.sequenceIndex}</span>
        </div>
        <h3>Follow-up de {formatDate(row.dueAt)}</h3>
        <p className="osWhy">{row.reason}</p>
        <div className="osMeta">
          <span>política <b>{row.policyVersion}</b></span>
          <span>{relativeDays(row.dueAt)}</span>
        </div>
      </div>
      <div className="osCardActs">
        <Link className="btn" href={`/dashboard/opportunities/${row.opportunityId}`}>
          Preparar
        </Link>
        <button
          className="chip"
          type="button"
          disabled={pending}
          onClick={() => start(async () => { await followUpSent(row.id); setGone(true); })}
        >
          Já enviei
        </button>
        <button
          className="chip"
          type="button"
          disabled={pending}
          onClick={() => start(async () => { await followUpSnooze(row.id, 3); setGone(true); })}
        >
          Adiar 3 dias
        </button>
      </div>
    </article>
  );
}

export default function FollowUps({
  due, upcoming, nurture, sent,
}: {
  due: FollowUpRow[];
  upcoming: FollowUpRow[];
  nurture: FollowUpRow[];
  sent: FollowUpRow[];
}) {
  return (
    <>
      <div className="dashBar">
        <h1>Follow-ups</h1>
        <span className="dashState" data-tone={due.length ? 'dirty' : 'ok'}>
          {due.length} para hoje
        </span>
      </div>

      <p className="osNote">
        As datas saem da cadência versionada e da promessa da marca — nunca de memória. Uma resposta
        cancela o lembrete pendente sozinha.
      </p>

      <section className="osSection">
        <h2>Vencidos</h2>
        {due.length ? (
          <div className="osQueue">{due.map((f) => <Item key={f.id} row={f} />)}</div>
        ) : (
          <p className="osEmpty">Nada vencido. Bom sinal.</p>
        )}
      </section>

      {upcoming.length ? (
        <section className="osSection">
          <h2>A caminho</h2>
          <div className="osRows">
            {upcoming.map((f) => (
              <Link className="osRow" key={f.id} href={`/dashboard/opportunities/${f.opportunityId}`}>
                <div>
                  <span className="osRowName">{f.brandName}</span>
                  <p className="osRowSub">{f.reason}</p>
                </div>
                <div className="osRowSide">
                  <span>{formatDate(f.dueAt)}</span>
                  <span className="osTag" data-tone="mute">#{f.sequenceIndex}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {nurture.length ? (
        <section className="osSection">
          <h2>Nurture</h2>
          <p className="osNote">
            Sequência ativa encerrada. Voltam numa data futura, com contexto novo em vez de mais
            uma insistência.
          </p>
          <div className="osRows">
            {nurture.map((f) => (
              <Link className="osRow" key={f.id} href={`/dashboard/opportunities/${f.opportunityId}`}>
                <div>
                  <span className="osRowName">{f.brandName}</span>
                  <p className="osRowSub">{f.reason}</p>
                </div>
                <div className="osRowSide"><span>{formatDate(f.dueAt)}</span></div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {sent.length ? (
        <section className="osSection">
          <h2>Enviados</h2>
          <div className="osRows">
            {sent.map((f) => (
              <div className="osRow" key={f.id}>
                <div>
                  <span className="osRowName" style={{ fontSize: 17 }}>{f.brandName}</span>
                  <p className="osRowSub">
                    {SITUATION_LABEL[f.situation as Situation] ?? f.situation} · #{f.sequenceIndex}
                  </p>
                </div>
                <div className="osRowSide"><span>{formatDate(f.dueAt)}</span></div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
