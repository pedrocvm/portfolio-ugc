'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { readMailThread, replyToMailThread, type MailThread as Thread } from '@/app/dashboard/carolos-actions';
import Spinner from '@/components/dashboard/Spinner';
import { useExit } from '@/components/dashboard/useExit';
import { formatDate } from '@/lib/time';

/** A conversa inteira, sem sair do CarolOS.
 *
 *  A leitura vem da base — o corpo das mensagens é salvo na ingestão — por
 *  isso abre depressa e continua a funcionar com o Gmail em baixo. A resposta é
 *  que precisa do Gmail, e sai como rascunho: escrever e enviar são duas
 *  decisões, e a segunda é dela. */

export default function MailThread({ threadId, onClose }: { threadId: string; onClose: () => void }) {
  const { closing, close } = useExit(onClose);
  const [thread, setThread] = useState<Thread | null>(null);
  const [error, setError] = useState('');
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState('');
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    readMailThread(threadId).then((r) => {
      if (!alive) return;
      if ('error' in r) setError(r.error);
      else setThread(r);
    });
    return () => {
      alive = false;
    };
  }, [threadId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    box.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [close]);

  async function send() {
    setSending(true);
    setDone('');
    const r = await replyToMailThread(threadId, reply);
    setSending(false);
    if ('error' in r && r.error) setError(r.error);
    else {
      setDone('Rascunho criado no Gmail, dentro desta conversa. Abra o Gmail para revisar e enviar.');
      setReply('');
    }
  }

  return (
    <div className="pick" data-closing={closing || undefined}>
      <button className="pickScrim" type="button" aria-label="Fechar" onClick={close} />
      <div
        className="pickBox mailBox"
        role="dialog"
        aria-modal="true"
        aria-label={thread ? thread.subject : 'Conversa'}
        tabIndex={-1}
        ref={box}
      >
        <header className="mailHead">
          <div>
            <h2>{thread?.subject || (error ? 'Não deu' : 'A abrir…')}</h2>
            {thread ? (
              <p className="osRowSub">
                {thread.brandName ?? 'marca por identificar'}
                {thread.messages.length ? ` · ${thread.messages.length} mensagens` : ''}
              </p>
            ) : null}
          </div>
          <button className="chip" type="button" onClick={close}>
            Fechar
          </button>
        </header>

        {error ? <p className="osWarn">{error}</p> : null}

        {!thread && !error ? (
          <p className="osRowSub">
            <Spinner label="A abrir a conversa" />A abrir a conversa…
          </p>
        ) : null}

        {thread ? (
          <>
            <div className="mailScroll">
              {thread.messages.map((m) => (
                <article className="mailMsg" key={m.id} data-dir={m.direction}>
                  <div className="mailMeta">
                    <b>{m.direction === 'outbound' ? 'Tu' : m.fromName || m.fromAddress}</b>
                    <span>{formatDate(m.sentAt)}</span>
                  </div>
                  <p className="mailBody">{m.body || m.subject}</p>
                </article>
              ))}
              {thread.messages.length === 0 ? (
                <p className="osRowSub">Esta conversa não tem mensagens salvas.</p>
              ) : null}
            </div>

            <div className="mailReply">
              <label className="visually-hidden" htmlFor="mailReplyText">
                Resposta
              </label>
              <textarea
                id="mailReplyText"
                rows={5}
                placeholder={
                  thread.replyTo
                    ? `Responder a ${thread.replyTo}…`
                    : 'Esta conversa não tem remetente para responder.'
                }
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                disabled={!thread.replyTo || sending}
              />
              {done ? (
                <p className="osWarn" data-tone="ok">
                  {done}
                </p>
              ) : null}
              <div className="mailActs">
                <button
                  className="osPageBtn"
                  type="button"
                  onClick={send}
                  disabled={!thread.replyTo || sending || reply.trim().length < 2}
                >
                  {sending ? <Spinner label="A preparar" /> : null}
                  Preparar rascunho no Gmail
                </button>
                {thread.opportunityId ? (
                  <Link className="chip" href={`/dashboard/opportunities/${thread.opportunityId}`}>
                    Abrir a oportunidade
                  </Link>
                ) : null}
                {thread.brandId ? (
                  <Link className="chip" href={`/dashboard/brands/${thread.brandId}`}>
                    Abrir a marca
                  </Link>
                ) : null}
              </div>
              <p className="osRowSub">
                O CarolOS não envia emails sozinho. Isto deixa o rascunho na sua caixa, pronto para
                leres e enviares.
              </p>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
