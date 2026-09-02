'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import {
  approveOutreach,
  sendApprovedOutreach,
  skipOutreach,
  updateOutreachDraft,
} from '@/app/dashboard/outreach-actions';
import Spinner from '@/components/dashboard/Spinner';
import { pushToast } from '@/components/dashboard/Toasts';
import { useExit } from '@/components/dashboard/useExit';
import type { Candidate } from './Outreach';

/** Rever os emails prontos, um de cada vez.
 *
 *  A lista serve para ver o dia inteiro. Não serve para o despachar: com vinte
 *  candidatas, aprovar à mão é abrir uma linha, ler, aprovar, fechar, procurar
 *  a seguinte — e ao quinto isso deixa de se fazer.
 *
 *  Aqui há uma marca, a razão de ela estar ali, e o email. Aprovar avança
 *  sozinho. No fim há um botão só, e é aí que a confirmação aparece: aprovar é
 *  reversível e não pergunta nada; enviar sai cá para fora e pergunta sempre,
 *  com a conta e o número à frente. */

export default function ReviewMode({ candidates }: { candidates: Candidate[] }) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(0);
  const [aprovadas, setAprovadas] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const [running, setRunning] = useState('');
  const [erro, setErro] = useState('');
  const [confirmar, setConfirmar] = useState(false);
  const { closing, close } = useExit(() => setOpen(false), 220);
  const caixa = useRef<HTMLDivElement>(null);

  const atual = candidates[at];
  const acabou = at >= candidates.length;

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

  if (candidates.length === 0) return null;

  const avanca = () => {
    setAt((v) => v + 1);
    setConfirmar(false);
  };

  const correr = (id: string, fn: () => Promise<{ error?: string }>, depois: () => void) =>
    start(async () => {
      setRunning(id);
      const r = await fn();
      setRunning('');
      if (r.error) setErro(r.error);
      else depois();
    });

  const aprovar = (alvo: string, subject: string, body: string, mexido: boolean) =>
    correr(
      'approve',
      async () => {
        if (mexido) {
          const g = await updateOutreachDraft(alvo, subject, body);
          if (g.error) return g;
        }
        return approveOutreach(alvo);
      },
      () => {
        setAprovadas((v) => [...v, alvo]);
        avanca();
      },
    );

  const enviar = () =>
    correr(
      'send',
      async () => {
        const r = await sendApprovedOutreach();
        if (!r.error) {
          pushToast(
            r.failed
              ? `${r.sent} enviados, ${r.failed} falharam.`
              : `${r.sent} ${r.sent === 1 ? 'email enviado' : 'emails enviados'}.`,
            r.failed ? 'warn' : 'ok',
          );
        }
        return r;
      },
      () => {
        setConfirmar(false);
        close();
      },
    );

  return (
    <>
      <button className="osStart" type="button" onClick={() => { setAt(0); setAprovadas([]); setOpen(true); }}>
        Rever {candidates.length === 1 ? 'o email pronto' : `os ${candidates.length} emails`}
        <span aria-hidden="true">→</span>
      </button>

      {open ? (
        <div className="focus" data-closing={closing || undefined}>
          <button
            className="pickScrim"
            type="button"
            aria-label="Fechar"
            onClick={close}
          />
          <div
            className="focusBox revBox"
            role="dialog"
            aria-modal="true"
            aria-label="Rever emails"
            tabIndex={-1}
            ref={caixa}
          >
            <header className="focusTop">
              <span className="focusAt">
                {acabou ? 'Revistos' : `${at + 1} de ${candidates.length}`}
              </span>
              <button type="button" onClick={close} aria-label="Fechar">
                ×
              </button>
            </header>

            <div className="focusBar" aria-hidden="true">
              <span
                style={{ '--p': `${(Math.min(at, candidates.length) / candidates.length) * 100}%` } as React.CSSProperties}
              />
            </div>

            {erro ? (
              <p className="osWarn" role="alert">
                {erro}
              </p>
            ) : null}

            {acabou ? (
              <div className="focusDone">
                <h2>
                  {aprovadas.length === 0
                    ? 'Nenhuma aprovada.'
                    : aprovadas.length === 1
                      ? 'Uma aprovada.'
                      : `${aprovadas.length} aprovadas.`}
                </h2>

                {aprovadas.length === 0 ? (
                  <>
                    <p>Não fica nada por enviar.</p>
                    <button className="osStart" type="button" onClick={close}>
                      Fechar
                    </button>
                  </>
                ) : confirmar ? (
                  <>
                    {/* A única confirmação desta tela, e a razão de existir:
                        daqui para a frente as mensagens saem para pessoas. */}
                    <p>
                      Vou enviar {aprovadas.length}{' '}
                      {aprovadas.length === 1 ? 'email' : 'emails'} a partir da caixa dela. Depois de
                      sair não há como voltar atrás.
                    </p>
                    <div className="revConfirm">
                      <button
                        className="osStart"
                        type="button"
                        disabled={pending}
                        onClick={enviar}
                      >
                        {running === 'send' ? <Spinner label="Enviando" /> : null}
                        Enviar {aprovadas.length}
                      </button>
                      <button
                        className="focusSkip"
                        type="button"
                        disabled={pending}
                        onClick={() => setConfirmar(false)}
                      >
                        Agora não
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p>Ficam à espera. Nada sai sem o seu sim.</p>
                    <div className="revConfirm">
                      <button className="osStart" type="button" onClick={() => setConfirmar(true)}>
                        Enviar {aprovadas.length === 1 ? 'o email' : `os ${aprovadas.length}`}
                      </button>
                      <button className="focusSkip" type="button" onClick={close}>
                        Depois
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : atual ? (
              <Draft
                key={atual.id}
                candidate={atual}
                pending={pending}
                running={running}
                onApprove={aprovar}
                onSkip={() => correr('skip', () => skipOutreach(atual.id), avanca)}
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Uma candidata, com o email dela.
 *
 *  Componente próprio e com chave de propósito: o rascunho editado nasce das
 *  props e some quando ela avança. A alternativa era um efeito a repor o estado
 *  a cada mudança de candidata — cascata de renders, e o React tem uma
 *  ferramenta para isto que é a chave. */
function Draft({
  candidate,
  pending,
  running,
  onApprove,
  onSkip,
}: {
  candidate: Candidate;
  pending: boolean;
  running: string;
  onApprove: (id: string, subject: string, body: string, mexido: boolean) => void;
  onSkip: () => void;
}) {
  const [subject, setSubject] = useState(candidate.subject);
  const [body, setBody] = useState(candidate.body);
  const [editing, setEditing] = useState(false);

  const mexido = subject !== candidate.subject || body !== candidate.body;

  return (
    <div className="focusOne">
      <span className="osBrand">{candidate.name}</span>
      <h2>{subject || 'Sem assunto'}</h2>
      <p className="focusWhy">{candidate.why_fit || candidate.product || ''}</p>

      {editing ? (
        <div className="revEdit">
          <label htmlFor="revSubject">Assunto</label>
          <input id="revSubject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <label htmlFor="revBody">Mensagem</label>
          <textarea id="revBody" rows={12} value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
      ) : (
        <pre className="revBody">{body || 'Sem email escrito para esta marca.'}</pre>
      )}

      <div className="focusActs">
        <button
          className="osGo"
          type="button"
          disabled={pending || !body.trim()}
          onClick={() => onApprove(candidate.id, subject, body, mexido)}
        >
          {running === 'approve' ? <Spinner label="Aprovando" /> : null}
          {mexido ? 'Salvar e aprovar' : 'Aprovar'}
        </button>

        <button
          className="osPageBtn"
          type="button"
          disabled={pending}
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? 'Ver como fica' : 'Editar'}
        </button>

        <button className="focusSkip" type="button" disabled={pending} onClick={onSkip}>
          {running === 'skip' ? <Spinner label="Saltando" /> : null}
          Hoje não
        </button>
      </div>
    </div>
  );
}
