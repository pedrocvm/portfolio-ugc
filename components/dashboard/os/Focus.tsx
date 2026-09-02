'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { dismiss, doneAction, reopenAction, snooze } from '@/app/dashboard/carolos-actions';
import { pushUndo } from '@/components/dashboard/Toasts';
import Spinner from '@/components/dashboard/Spinner';
import { useExit } from '@/components/dashboard/useExit';
import type { ActionRow } from '@/modules/actions/service';

/** Resolver o dia: uma decisão de cada vez.
 *
 *  A fila resolve o «o quê». Isto resolve o «e agora?» — a pergunta que fazia
 *  voltar ao topo da lista depois de cada cartão, reler tudo e escolher outra
 *  vez. Aqui não há lista: há a próxima, e a seguir a essa.
 *
 *  As três saídas reversíveis — já está, depois, não é preciso — fazem-se sem
 *  perguntar e deixam «desfazer» num aviso. Confirmação fica para o que sai cá
 *  para fora, e nada aqui sai.
 *
 *  Onde há trabalho a sério a fazer, o botão principal abre a tela dessa
 *  oportunidade. O lugar salva-se: voltar continua de onde parou. */

const RETOMA = 'carolos.focus.at';


export default function Focus({ actions }: { actions: ActionRow[] }) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(0);
  const [feitos, setFeitos] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const [running, setRunning] = useState('');
  const [erro, setErro] = useState('');
  const { closing, close } = useExit(() => setOpen(false), 220);
  const caixa = useRef<HTMLDivElement>(null);

  const restantes = actions.filter((a) => !feitos.includes(a.id));
  const atual = restantes[Math.min(at, Math.max(0, restantes.length - 1))];
  const acabou = restantes.length === 0;

  // Onde ela ia. Sobrevive a fechar o browser a meio; não sobrevive ao dia
  // seguinte, porque a fila é outra.
  useEffect(() => {
    if (!open) return;
    try {
      sessionStorage.setItem(RETOMA, String(at));
    } catch {
      /* modo privado: a retoma vale só enquanto a tela estiver aberta */
    }
  }, [open, at]);

  const abrir = useCallback(() => {
    let inicio = 0;
    try {
      const salvo = Number(sessionStorage.getItem(RETOMA));
      if (Number.isInteger(salvo) && salvo > 0 && salvo < actions.length) inicio = salvo;
    } catch {
      /* sem sessionStorage, começa no princípio */
    }
    setAt(inicio);
    setFeitos([]);
    setErro('');
    setOpen(true);
  }, [actions.length]);

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

  if (actions.length === 0) return null;

  const resolver = (
    id: string,
    etiqueta: string,
    fn: () => Promise<{ error?: string }>,
  ) =>
    start(async () => {
      if (!atual) return;
      const alvo = atual.id;
      setRunning(id);
      const r = await fn();
      setRunning('');
      if (r.error) {
        setErro(r.error);
        return;
      }
      setErro('');
      // Sai da lista e a seguinte ocupa o lugar: o índice fica onde está.
      setFeitos((v) => [...v, alvo]);
      pushUndo(etiqueta, async () => {
        await reopenAction(alvo);
        setFeitos((v) => v.filter((x) => x !== alvo));
      });
    });

  const total = actions.length;
  const posicao = total - restantes.length + 1;

  return (
    <>
      <button className="osStart" type="button" onClick={abrir}>
        Resolver agora
        <span aria-hidden="true">→</span>
      </button>

      {open ? (
        <div className="focus" data-closing={closing || undefined}>
          <button className="pickScrim" type="button" aria-label="Fechar" onClick={close} />
          <div
            className="focusBox"
            role="dialog"
            aria-modal="true"
            aria-label="Resolver o dia"
            tabIndex={-1}
            ref={caixa}
          >
            <header className="focusTop">
              <span className="focusAt">
                {acabou ? 'Terminado' : `${posicao} de ${total}`}
              </span>
              <button type="button" onClick={close} aria-label="Fechar">
                ×
              </button>
            </header>

            {/* A barra é a contagem real, não uma percentagem inventada. */}
            <div className="focusBar" aria-hidden="true">
              <span style={{ '--p': `${((total - restantes.length) / total) * 100}%` } as React.CSSProperties} />
            </div>

            {acabou ? (
              <div className="focusDone">
                <h2>Está tudo.</h2>
                <p>Não há mais nada que precise de você agora.</p>
                <button className="osStart" type="button" onClick={close}>
                  Fechar
                </button>
              </div>
            ) : atual ? (
              <div className="focusOne" key={atual.id}>
                <span className="osBrand">{atual.brandName}</span>
                <h2>{atual.title}</h2>
                <p className="focusWhy">{atual.reason}</p>

                {erro ? (
                  <p className="osWarn" role="alert">
                    {erro}
                  </p>
                ) : null}

                <div className="focusActs">
                  <Link
                    className="osGo"
                    href={
                      atual.opportunityId
                        ? `/dashboard/opportunities/${atual.opportunityId}`
                        : atual.brandId
                          ? `/dashboard/brands/${atual.brandId}`
                          : '/dashboard/settings'
                    }
                  >
                    {atual.cta}
                  </Link>

                  <button
                    className="osPageBtn"
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      resolver('done', `«${atual.title}» dado como feito.`, () =>
                        doneAction(atual.id),
                      )
                    }
                  >
                    {running === 'done' ? <Spinner label="Marcando" /> : null}
                    Já está
                  </button>

                  <button
                    className="osPageBtn"
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      resolver('snooze', `«${atual.title}» volta daqui a 3 dias.`, () =>
                        snooze(atual.id, 3),
                      )
                    }
                  >
                    {running === 'snooze' ? <Spinner label="Adiando" /> : null}
                    Depois
                  </button>

                  <button
                    className="focusSkip"
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      resolver('dismiss', `«${atual.title}» saiu da fila.`, () =>
                        dismiss(atual.id),
                      )
                    }
                  >
                    Não é preciso
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
