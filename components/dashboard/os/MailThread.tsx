'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { readMailThread, replyToMailThread, type MailThread as Thread } from '@/app/dashboard/carolos-actions';
import Spinner from '@/components/dashboard/Spinner';
import { useExit } from '@/components/dashboard/useExit';
import { formatDate } from '@/lib/time';

/** A conversa, pela ordem em que serve de alguma coisa.
 *
 *  Abria com catorze emails por ler e uma caixa de texto vazia. Ler catorze
 *  emails para descobrir que a marca pediu preço é trabalho que o sistema já
 *  fez na ingestão.
 *
 *  Agora abre com o que interessa: o que pediram, há quanto tempo esperam, e o
 *  que o CarolOS acha que é o próximo passo. Essa recomendação é a mesma que
 *  enche o Hoje — sai do planeador, é determinística, e não depende de haver
 *  chave de modelo configurada. A conversa inteira fica logo abaixo, dobrada,
 *  para quando for preciso confirmar.
 *
 *  A leitura vem da base — o corpo das mensagens é salvo na ingestão — por
 *  isso abre depressa e continua a funcionar com o Gmail em baixo. A resposta é
 *  que precisa do Gmail, e sai como rascunho: escrever e enviar são duas
 *  decisões, e a segunda é dela. */

/** Os pedidos como substantivos, para caberem numa frase. As etiquetas do
 *  inbox são frases verbais e não colam depois de «pediu». */
const ASK_NOUN: Record<string, string> = {
  portfolio_request: 'o portfólio',
  rate_request: 'o teu valor',
  ads_rights: 'direitos para anúncios',
  usage_request: 'direitos de uso',
  barter_offer: 'uma permuta',
  affiliate_offer: 'uma parceria de afiliação',
  media_kit_request: 'o media kit',
  call_request: 'uma call',
  brief: 'o briefing',
};

function pedidos(asks: string[]): string | null {
  const nomes = asks.map((a) => ASK_NOUN[a]).filter(Boolean);
  if (!nomes.length) return null;
  if (nomes.length === 1) return nomes[0];
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}

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

  // Uma frase, não duas. A espera já vinha escrita outra vez dentro da razão da
  // recomendação — a mesma informação, com as mesmas palavras, dois centímetros
  // abaixo.
  const pedido = thread ? pedidos(thread.asks) : null;
  const espera =
    thread && thread.waitingDays !== null && !thread.next?.reason.includes('à espera')
      ? thread.waitingDays === 0
        ? 'Chegou hoje e ainda não teve resposta.'
        : `À espera de resposta há ${thread.waitingDays} ${thread.waitingDays === 1 ? 'dia' : 'dias'}.`
      : null;
  const resumo = pedido ? `Pediram ${pedido}.${espera ? ` ${espera}` : ''}` : espera;

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
              {/* O resumo primeiro. Se o sistema já sabe o que pediram, ela não
                  tem de o descobrir a ler. */}
              {resumo ? (
                <div className="mailGist">
                  <p className="mailGistAsk">{resumo}</p>
                </div>
              ) : null}

              {thread.next ? (
                <div className="mailNext">
                  <span className="mailNextLabel">O que eu faria</span>
                  <b>{thread.next.title}</b>
                  <p>{thread.next.reason}</p>
                </div>
              ) : null}

              {/* A conversa inteira, dobrada. Quem precisa de confirmar abre. */}
              <details className="mailAll">
                <summary>
                  {thread.messages.length
                    ? `Ver a conversa (${thread.messages.length})`
                    : 'Ver a conversa'}
                </summary>
                {thread.messages.map((m) => (
                  <article className="mailMsg" key={m.id} data-dir={m.direction}>
                    <div className="mailMeta">
                      <b>{m.direction === 'outbound' ? 'Eu' : m.fromName || m.fromAddress}</b>
                      <span>{formatDate(m.sentAt)}</span>
                    </div>
                    <p className="mailBody">{m.body || m.subject}</p>
                  </article>
                ))}
                {thread.messages.length === 0 ? (
                  <p className="osRowSub">Esta conversa não tem mensagens salvas.</p>
                ) : null}
              </details>
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
                O CarolOS não envia emails sozinho. Isto deixa o rascunho na caixa dela, pronto a
                rever e a enviar.
              </p>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
