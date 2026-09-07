'use client';

import { useState, useTransition } from 'react';
import Spinner from '@/components/dashboard/Spinner';
import { writeScript } from '@/app/dashboard/content-brain-actions';
import type { StoryMoment } from '@/modules/content-brain/domain';

/** Os momentos e o roteiro de uma história pronta, no sítio onde ela vai gravar.
 *
 *  Era isto que faltava depois de «Pronta para gravar»: a estrutura ficava na
 *  base e a tela só dizia «4 momentos». O roteiro continua opcional — quem não
 *  o pediu no Workshop pode pedi-lo aqui, sem voltar atrás. */
export default function StoryPlan({
  storyId,
  moments,
  script: inicial,
  mustNotInvent,
}: {
  storyId: string;
  moments: StoryMoment[];
  script: string | null;
  mustNotInvent: string[];
}) {
  const [script, setScript] = useState(inicial);
  const [erro, setErro] = useState('');
  const [pending, start] = useTransition();

  if (!moments.length && !script) return null;

  const pedir = () => {
    setErro('');
    start(async () => {
      const r = await writeScript(storyId);
      if ('error' in r) return setErro(r.error);
      setScript(r.script);
    });
  };

  return (
    <details className="cbSub cbStoryPlan">
      <summary>{script ? 'Ver os momentos e o roteiro' : 'Ver os momentos'}</summary>
      {moments.length ? (
        <ol className="cbMoments">
          {moments.map((m) => (
            <li key={m.order}>
              <b>{m.purpose}.</b> {m.intent}
              {m.line ? <q>{m.line}</q> : null}
              {m.visual ? <small>Apoio visual: {m.visual}</small> : null}
              {m.suggestion ? <small>Sugestão minha de forma; o resto vem do que você contou.</small> : null}
            </li>
          ))}
        </ol>
      ) : null}
      {script ? (
        <div className="cbScript">
          <p className="cbScriptNote">Um guia, não um texto obrigatório. Fale do seu jeito.</p>
          <pre>{script}</pre>
        </div>
      ) : (
        <div className="cbActs">
          <p className="cbScriptNote">Sem roteiro escrito: os momentos já são o guia.</p>
          <button className="focusSkip" type="button" onClick={pedir} disabled={pending}>
            {pending ? <Spinner label="Escrevendo" /> : 'Me ajude a organizar as palavras'}
          </button>
        </div>
      )}
      {erro ? (
        <p className="osWarn" role="alert">
          {erro}
        </p>
      ) : null}
      {mustNotInvent.length ? <p className="cbScriptNote">Não pode ser reencenado: {mustNotInvent.join(' · ')}</p> : null}
    </details>
  );
}
