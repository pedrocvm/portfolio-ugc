'use client';

import { useState, useTransition } from 'react';
import { changeStage, openCollaboration, wait } from '@/app/dashboard/carolos-actions';
import { STAGES, STAGE_LABEL, type Stage } from '@/modules/opportunities/domain';

/** Mudar etapa à mão continua a existir — é o fallback, não o caminho normal.
 *  Fechar e perder pedem motivo: sem ele, daqui a três meses ninguém sabe
 *  porque é que a oportunidade morreu. */
export default function StageControl({
  opportunityId,
  stage,
  waitingUntil,
  waitingReason,
  hasCollaboration,
}: {
  opportunityId: string;
  stage: Stage;
  waitingUntil: string | null;
  waitingReason: string | null;
  hasCollaboration: boolean;
}) {
  const [pending, start] = useTransition();
  const [next, setNext] = useState<Stage>(stage);
  const [reason, setReason] = useState('');
  const [until, setUntil] = useState(waitingUntil?.slice(0, 10) ?? '');
  const [waitWhy, setWaitWhy] = useState(waitingReason ?? '');
  const [error, setError] = useState('');

  const needsReason = next === 'lost';

  return (
    <div className="osPanel">
      <h3>Estado</h3>

      <div className="osInline">
        <label className="osField">
          <span>Etapa</span>
          <select value={next} onChange={(e) => setNext(e.target.value as Stage)}>
            {STAGES.map((s) => (
              <option key={s} value={s}>{STAGE_LABEL[s]}</option>
            ))}
          </select>
        </label>
        {needsReason ? (
          <label className="osField">
            <span>Motivo da perda</span>
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
        ) : null}
        <button
          className="btn"
          type="button"
          disabled={pending || next === stage}
          onClick={() =>
            start(async () => {
              setError('');
              const result = await changeStage(opportunityId, next, reason);
              if (result.error) setError(result.error);
            })
          }
        >
          Guardar etapa
        </button>
      </div>

      {error ? <p className="osWarn" role="alert">{error}</p> : null}

      <div className="osInline" style={{ marginTop: 14 }}>
        <label className="osField">
          <span>Em espera até</span>
          <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
        </label>
        <label className="osField">
          <span>Porquê</span>
          <input type="text" value={waitWhy} onChange={(e) => setWaitWhy(e.target.value)}
            placeholder="A marca pediu para voltar depois do lançamento" />
        </label>
        <button
          className="chip"
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await wait(opportunityId, until ? `${until}T12:00:00.000Z` : '', waitWhy);
            })
          }
        >
          {until ? 'Pôr em espera' : 'Tirar da espera'}
        </button>
      </div>
      <p className="osRowSub">
        Em espera, a oportunidade sai do Hoje sem desaparecer, e nenhum follow-up é agendado até lá.
      </p>

      {stage === 'won' && !hasCollaboration ? (
        <div className="osActs">
          <button
            className="btn"
            type="button"
            disabled={pending}
            onClick={() => start(() => openCollaboration(opportunityId).then(() => undefined))}
          >
            Abrir a produção
          </button>
        </div>
      ) : null}
    </div>
  );
}
