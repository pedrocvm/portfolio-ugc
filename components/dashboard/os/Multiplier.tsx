'use client';

import { useState, useTransition } from 'react';
import Spinner from '@/components/dashboard/Spinner';
import { contentFromJob } from '@/app/dashboard/morning-actions';
import type { MultiplierSuggestion } from '@/modules/creator/multiplier-service';

/** «Que conteúdo meu sai desta mesma gravação?»
 *
 *  Ela já está em casa, com o produto na mão e o tripé de pé. É o momento mais
 *  barato do mês para gravar mais uma coisa — e é o momento em que ninguém se
 *  lembra disso.
 *
 *  Não corre sozinho: é uma chamada ao modelo por gravação, e a maior parte das
 *  gravações não precisa de a gastar. Corre quando ela pergunta. */

export default function Multiplier({ collaborationId }: { collaborationId: string }) {
  const [pending, start] = useTransition();
  const [suggestions, setSuggestions] = useState<MultiplierSuggestion[] | null>(null);
  const [reason, setReason] = useState('');

  const pedir = () =>
    start(async () => {
      setReason('');
      const r = await contentFromJob(collaborationId).catch(() => ({
        error: 'Não consegui pensar nisto agora.',
      }));
      if ('error' in r && r.error) {
        setReason(r.error);
        setSuggestions(null);
        return;
      }
      const lista = 'suggestions' in r ? r.suggestions : [];
      setSuggestions(lista ?? []);
    });

  return (
    <div className="osPanel">
      <h3>Conteúdo meu, desta mesma gravação</h3>
      <p className="osNote">
        Com a luz montada e o produto à frente, quase sempre sai mais do que o vídeo da marca — sem
        acrescentar meia hora.
      </p>

      {reason ? (
        <p className="osWarn" role="alert">
          {reason}
        </p>
      ) : null}

      {suggestions?.length ? (
        <ul className="multList">
          {suggestions.map((s, i) => (
            <li key={i}>
              <span className="multPlat">{s.platform === 'instagram' ? 'Instagram' : 'TikTok'}</span>
              <b>{s.angle}</b>
              <p className="multHook">«{s.hook}»</p>
              <p className="osRowSub">
                {s.extraEffort} · mais {s.extraMinutes} min
                {s.pillarLabel ? ` · ${s.pillarLabel}` : ''}
              </p>
            </li>
          ))}
        </ul>
      ) : suggestions ? (
        <p className="osRowSub">
          Desta gravação não sai nada de útil sem acrescentar trabalho a mais.
        </p>
      ) : null}

      <button className="osPageBtn" type="button" disabled={pending} onClick={pedir}>
        {pending ? <Spinner label="Pensando" /> : null}
        {suggestions ? 'Ver outra vez' : 'O que mais posso gravar?'}
      </button>
    </div>
  );
}
