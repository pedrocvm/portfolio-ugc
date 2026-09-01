'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useExit } from '@/components/dashboard/useExit';
import type { Shot } from '@/modules/content/domain';

/** Modo de gravação.
 *
 *  A shot list é uma lista numerada, e uma lista numerada lê-se sentada. A
 *  gravar é outra coisa: o telemóvel está na mão ou no tripé, ela está a
 *  segurar o produto, e o que precisa de ver é a tomada seguinte — não as sete.
 *
 *  Uma de cada vez, com o número grande e nada à volta. Marcar avança sozinho.
 *  As opcionais ficam para o fim, atrás de uma frase que dá licença para não as
 *  fazer: uma lista que obriga a tudo é uma lista que se abandona a meio.
 *
 *  O sítio onde ela ia sobrevive a fechar a aplicação. Filmar é levantar,
 *  mudar de sítio, voltar — e recomeçar do princípio ao voltar seria motivo
 *  para nunca mais abrir isto. */

const chave = (id: string) => `carolos.rec.${id}`;

export default function RecordingMode({
  contentId,
  title,
  shots,
}: {
  contentId: string;
  title: string;
  shots: Shot[];
}) {
  const [open, setOpen] = useState(false);
  const [feitas, setFeitas] = useState<number[]>([]);
  const { closing, close } = useExit(() => setOpen(false), 220);
  const caixa = useRef<HTMLDivElement>(null);

  // Obrigatórias primeiro. Uma tomada sem `required` conta como obrigatória:
  // na dúvida, é melhor ela gravar a mais do que descobrir a falta depois de
  // devolver o produto.
  const ordenadas = [...shots.keys()].sort((a, b) => {
    const oa = shots[a].required === false ? 1 : 0;
    const ob = shots[b].required === false ? 1 : 0;
    return oa - ob;
  });
  const obrigatorias = ordenadas.filter((i) => shots[i].required !== false);
  const opcionais = ordenadas.filter((i) => shots[i].required === false);

  const porGravar = ordenadas.filter((i) => !feitas.includes(i));
  const actual = porGravar[0];
  const faltamObrigatorias = obrigatorias.filter((i) => !feitas.includes(i)).length;
  const acabou = actual === undefined;
  const soFaltamExtras = !acabou && faltamObrigatorias === 0;

  const guardar = useCallback(
    (lista: number[]) => {
      setFeitas(lista);
      try {
        localStorage.setItem(chave(contentId), JSON.stringify(lista));
      } catch {
        /* modo privado: vale para esta sessão */
      }
    },
    [contentId],
  );

  const abrir = () => {
    let guardado: number[] = [];
    try {
      const cru = localStorage.getItem(chave(contentId));
      const lido: unknown = cru ? JSON.parse(cru) : [];
      if (Array.isArray(lido)) guardado = lido.filter((n): n is number => Number.isInteger(n));
    } catch {
      /* começa do princípio */
    }
    setFeitas(guardado);
    setOpen(true);
  };

  const recomecar = () => guardar([]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    caixa.current?.focus();
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  if (shots.length === 0) return null;

  return (
    <>
      <button className="recStart" type="button" onClick={abrir}>
        Modo de gravação
      </button>

      {open ? (
        <div className="rec" data-closing={closing || undefined}>
          <div
            className="recBox"
            role="dialog"
            aria-modal="true"
            aria-label={`A gravar ${title}`}
            tabIndex={-1}
            ref={caixa}
          >
            <header className="recTop">
              <span>{title}</span>
              <button type="button" onClick={close} aria-label="Sair do modo de gravação">
                ×
              </button>
            </header>

            {acabou ? (
              <div className="recDone">
                <h2>Está tudo gravado.</h2>
                <p>
                  {opcionais.length
                    ? 'As obrigatórias e as extras. Não falta nada.'
                    : 'Não falta nenhuma tomada desta peça.'}
                </p>
                <div className="recDoneActs">
                  <button className="osStart" type="button" onClick={close}>
                    Fechar
                  </button>
                  <button className="focusSkip" type="button" onClick={recomecar}>
                    Recomeçar
                  </button>
                </div>
              </div>
            ) : (
              <div className="recOne" key={actual}>
                <span className="recCount">
                  {feitas.length + 1}/{shots.length}
                </span>

                {/* A licença para parar, e é aqui que ela ganha sentido: o que
                    falta já não é o trabalho, é o extra. */}
                {soFaltamExtras ? (
                  <p className="recBonus">
                    Já tem tudo o que era preciso. Se ainda tiver energia, ficam{' '}
                    {opcionais.length === 1 ? 'mais uma' : `mais ${opcionais.filter((i) => !feitas.includes(i)).length}`}.
                  </p>
                ) : null}

                <h2>{shots[actual].shot}</h2>
                {shots[actual].note ? <p className="recNote">{shots[actual].note}</p> : null}

                <div className="recActs">
                  <button
                    className="recGot"
                    type="button"
                    onClick={() => guardar([...feitas, actual])}
                  >
                    Gravei
                  </button>
                  {feitas.length ? (
                    <button
                      className="focusSkip"
                      type="button"
                      onClick={() => guardar(feitas.slice(0, -1))}
                    >
                      Voltar atrás
                    </button>
                  ) : null}
                </div>

                <div className="recBar" aria-hidden="true">
                  <span style={{ '--p': `${(feitas.length / shots.length) * 100}%` } as React.CSSProperties} />
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
