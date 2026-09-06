'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { readMailThread, replyToMailThread, type MailThread as Thread } from '@/app/dashboard/carolos-actions';
import { sendPreparedReply } from '@/app/dashboard/morning-actions';
import CarolAI from '@/components/dashboard/CarolAI';
import Spinner from '@/components/dashboard/Spinner';
import { useExit } from '@/components/dashboard/useExit';
import { isActionable } from '@/modules/actions/next-action';
import Conversation from './Conversation';
import NextActionCard from './NextActionCard';

/** A conversa, pela ordem em que serve de alguma coisa.
 *
 *  Primeiro o que a madrugada leu: quem escreveu, o que quer, o que falta, o
 *  risco. Depois a próxima ação — que já não é «responder» por omissão: pode
 *  ser um email novo para o contato que a marca indicou, ou uma escolha entre
 *  dois endereços. E por baixo, a conversa inteira à vista, cronológica, com
 *  busca e com a mensagem de origem a acender quando ela pede a prova.
 *
 *  Estava dobrada atrás de «Ver a conversa». Uma recomendação cuja prova está
 *  numa gaveta que ninguém descobre é uma recomendação em que ninguém confia. */

export default function MailThread({ threadId, onClose }: { threadId: string; onClose: () => void }) {
  const { closing, close } = useExit(onClose);
  const [thread, setThread] = useState<Thread | null>(null);
  const [error, setError] = useState('');
  const [foco, setFoco] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);
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
  }, [threadId, versao]);

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

  const reler = useCallback(() => setVersao((v) => v + 1), []);

  const acao = thread?.nextAction ?? null;
  const temAcao = isActionable(acao);

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
          <div className="mailScroll">
            {thread.intel ? (
              <div className="mailGist">
                <div className="mailGistTop">
                  <p className="mailGistAsk">
                    {thread.intel.whoWrote ? `${thread.intel.whoWrote}: ` : ''}
                    {thread.intel.whatTheyWant || thread.intel.recommendation}
                  </p>
                  <CarolAI what="Lida" />
                </div>
                <dl className="mornFacts">
                  {thread.intel.whatChanged ? (
                    <>
                      <dt>O que mudou</dt>
                      <dd>{thread.intel.whatChanged}</dd>
                    </>
                  ) : null}
                  {thread.intel.whatIsMissing ? (
                    <>
                      <dt>O que falta</dt>
                      <dd>{thread.intel.whatIsMissing}</dd>
                    </>
                  ) : null}
                  {thread.intel.risk ? (
                    <>
                      <dt>Risco</dt>
                      <dd data-risk={thread.intel.riskLevel}>{thread.intel.risk}</dd>
                    </>
                  ) : null}
                </dl>
              </div>
            ) : null}

            {acao ? (
              <NextActionCard
                threadId={threadId}
                action={acao}
                whoWrote={thread.intel?.whoWrote}
                onOpenSource={(id) => setFoco(id)}
                onChanged={reler}
                onDone={(what) => (what === 'sent' ? reler() : close())}
              />
            ) : thread.next ? (
              <div className="mailNext">
                <span className="mailNextLabel">O que eu faria</span>
                <b>{thread.next.title}</b>
                <p>{thread.next.reason}</p>
              </div>
            ) : null}

            <h3 className="mailConvoTitle">A conversa</h3>
            <Conversation messages={thread.messages} brandName={thread.brandName} focusId={foco} />

            {/* Sem leitura da madrugada ainda, a caixa de sempre: escreve-se e
                sai como resposta. Com leitura, quem envia é o cartão de cima. */}
            {!temAcao && thread.replyTo ? <LegacyReply threadId={threadId} to={thread.replyTo} subject={thread.intel?.draftSubject} /> : null}

            <div className="mailActs mailLinks">
              {thread.opportunityId ? (
                <Link className="chip" href={`/dashboard/opportunities/${thread.opportunityId}`}>
                  Abrir o negócio
                </Link>
              ) : null}
              {thread.brandId ? (
                <Link className="chip" href={`/dashboard/brands/${thread.brandId}`}>
                  Abrir a marca
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** A caixa de resposta de antes, para conversas sem leitura. */
function LegacyReply({ threadId, to, subject }: { threadId: string; to: string; subject?: string }) {
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState('');
  const [error, setError] = useState('');
  const [confirmar, setConfirmar] = useState(false);

  async function draft() {
    setSending(true);
    setDone('');
    setError('');
    const r = await replyToMailThread(threadId, reply);
    setSending(false);
    if ('error' in r && r.error) setError(r.error);
    else setDone('Rascunho criado no Gmail, dentro desta conversa.');
  }

  async function send() {
    setSending(true);
    setDone('');
    setError('');
    const r = await sendPreparedReply({ threadId, body: reply, subject }).catch(() => ({ error: 'Não consegui enviar agora. A mensagem continua aqui.' }));
    setSending(false);
    setConfirmar(false);
    if (r.error) setError(r.error);
    else setDone('Enviada.');
  }

  return (
    <div className="mailReply">
      <label className="visually-hidden" htmlFor="mailReplyText">
        Resposta
      </label>
      <textarea
        id="mailReplyText"
        rows={5}
        placeholder={`Responder a ${to}…`}
        value={reply}
        onChange={(e) => setReply(e.target.value)}
        disabled={sending}
      />
      {error ? <p className="osWarn">{error}</p> : null}
      {done ? (
        <p className="osWarn" data-tone="ok">
          {done}
        </p>
      ) : null}
      <div className="mailActs">
        {confirmar ? (
          <>
            <button className="osGo" type="button" onClick={send} disabled={sending}>
              {sending ? <Spinner label="Enviando" /> : null}
              Sim, enviar
            </button>
            <button className="osPageBtn" type="button" onClick={() => setConfirmar(false)} disabled={sending}>
              Afinal não
            </button>
          </>
        ) : (
          <>
            <button className="osGo" type="button" onClick={() => setConfirmar(true)} disabled={sending || reply.trim().length < 2}>
              Enviar
            </button>
            <button className="osPageBtn" type="button" onClick={draft} disabled={sending || reply.trim().length < 2}>
              {sending ? <Spinner label="Preparando" /> : null}
              Deixar rascunho no Gmail
            </button>
          </>
        )}
      </div>
      <p className="osRowSub">O CarolOS não envia nada sozinho. Sai quando você carregar em enviar.</p>
    </div>
  );
}
