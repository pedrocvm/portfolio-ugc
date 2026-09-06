'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { chooseReferredContactAction, postponeReply, sendPreparedCompose, sendPreparedReply } from '@/app/dashboard/morning-actions';
import CarolAI from '@/components/dashboard/CarolAI';
import Spinner from '@/components/dashboard/Spinner';
import { pushToast } from '@/components/dashboard/Toasts';
import type { NextAction } from '@/modules/actions/next-action';

/** A próxima ação de uma conversa, pronta a sair.
 *
 *  Uma superfície só para as três formas que uma conversa pode pedir:
 *
 *    responder     — o rascunho, na mesma linha, para quem escreveu;
 *    escrever      — um email NOVO para o contato que a marca indicou;
 *    escolher      — dois endereços na mensagem, e a decisão é dela.
 *
 *  O que a Cora pediu por escrito — «envie para marketing@cora.com.br» — sai
 *  daqui como email novo, endereçado, com o argumento original e a menção ao
 *  encaminhamento. E com a prova ao lado: por que este endereço, e onde está
 *  escrito.
 *
 *  Sai para fora: pede um segundo sim, e é o único botão aqui que o pede. */

export default function NextActionCard({
  threadId,
  action,
  whoWrote,
  onDone,
  onChanged,
  onOpenSource,
  compact = false,
}: {
  threadId: string;
  action: NextAction;
  whoWrote?: string;
  /** Saiu, ou ficou para depois: quem está por cima decide o que fazer. */
  onDone?: (what: 'sent' | 'postponed') => void;
  /** Ela escolheu o contato: a leitura mudou e é preciso reler. */
  onChanged?: () => void;
  /** Acende a mensagem de origem na conversa. */
  onOpenSource?: (messageId: string) => void;
  compact?: boolean;
}) {
  const artefato = action.preparedArtifact;
  const [assunto, setAssunto] = useState(artefato?.subject ?? '');
  const [corpo, setCorpo] = useState(artefato?.body ?? '');
  const [editando, setEditando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [erro, setErro] = useState('');
  const [pending, start] = useTransition();

  const compose = action.target.kind === 'compose';
  const confirm = action.type === 'confirm_referral';
  const para = action.target.to;
  const equipe = action.candidates[0]?.team ?? null;

  const enviar = () =>
    start(async () => {
      setErro('');
      const r = compose
        ? await sendPreparedCompose({ threadId, to: para, subject: assunto, body: corpo, aiDraft: artefato?.body }).catch(() => ({ error: 'Não consegui enviar agora. A mensagem continua aqui.' }))
        : await sendPreparedReply({ threadId, body: corpo, subject: assunto, aiDraft: artefato?.body }).catch(() => ({ error: 'Não consegui enviar agora. A mensagem continua aqui.' }));
      setConfirmar(false);
      if (r.error) return setErro(r.error);
      pushToast(compose ? `Enviado para ${para}.` : 'Resposta enviada.');
      onDone?.('sent');
    });

  const depois = () =>
    start(async () => {
      const r = await postponeReply(threadId).catch(() => ({ error: 'Não consegui adiar agora.' }));
      if (r.error) return setErro(r.error);
      pushToast('Fica para amanhã.');
      onDone?.('postponed');
    });

  const escolher = (email: string) =>
    start(async () => {
      setErro('');
      const r = await chooseReferredContactAction(threadId, email).catch(() => ({ error: 'Não consegui registar a escolha.' }));
      if (r.error) return setErro(r.error);
      onChanged?.();
    });

  /* ── Escolher para quem ────────────────────────────────────────────────── */
  if (confirm) {
    return (
      <section className="nba" data-kind="confirm">
        <p className="nbaEyebrow">Falta uma decisão sua</p>
        <h3>{action.needsDecision ?? action.reason}</h3>
        <ul className="nbaChoices">
          {action.candidates.map((c) => (
            <li key={c.email}>
              <button type="button" disabled={pending || !c.valid} onClick={() => escolher(c.email)}>
                <strong>{c.email}</strong>
                <span>{c.valid ? c.context : c.reason}</span>
              </button>
            </li>
          ))}
        </ul>
        {erro ? <p className="osWarn" role="alert">{erro}</p> : null}
        <div className="nbaActs">
          {action.evidence.sourceMessageId && onOpenSource ? (
            <button className="chip" type="button" onClick={() => onOpenSource(action.evidence.sourceMessageId!)}>
              Ver email original
            </button>
          ) : null}
          <button className="focusSkip" type="button" disabled={pending} onClick={depois}>
            Depois
          </button>
        </div>
      </section>
    );
  }

  /* ── Nada a fazer ──────────────────────────────────────────────────────── */
  if (!artefato || (action.target.kind !== 'reply' && action.target.kind !== 'compose')) {
    return (
      <section className="nba" data-kind="none">
        <p className="nbaEyebrow">Agora</p>
        <h3>{action.title}</h3>
        <p className="osWhy">{action.reason}</p>
      </section>
    );
  }

  /* ── Responder, ou escrever para o contato indicado ────────────────────── */
  const titulo = compose
    ? `${whoWrote?.trim() ? whoWrote.trim().split(' ')[0] : 'A marca'} te encaminhou para ${equipe ? `a equipe de ${equipe}` : para}.`
    : action.title;
  const porque = compose ? 'Encontrei o contato que ela passou e deixei o próximo email pronto.' : action.reason;

  return (
    <section className="nba" data-kind={compose ? 'compose' : 'reply'} data-compact={compact || undefined}>
      <div className="nbaTop">
        <p className="nbaEyebrow">{compose ? 'Email novo pronto' : 'Resposta pronta'}</p>
        {artefato.source === 'model' ? <CarolAI what="Escrito" /> : null}
      </div>
      <h3>{titulo}</h3>
      <p className="osWhy">{porque}</p>

      {compose ? (
        <p className="nbaWhy">
          {action.evidence.because}
          {action.evidence.sourceMessageId && onOpenSource ? (
            <>
              {' '}
              <button type="button" className="nbaLink" onClick={() => onOpenSource(action.evidence.sourceMessageId!)}>
                Ver email original
              </button>
            </>
          ) : null}
        </p>
      ) : null}

      <dl className="nbaMail">
        <dt>Para</dt>
        <dd>{para}</dd>
        <dt>Assunto</dt>
        <dd>
          {editando ? (
            <input value={assunto} onChange={(e) => setAssunto(e.target.value)} aria-label="Assunto" />
          ) : (
            assunto || '(sem assunto)'
          )}
        </dd>
        <dt>Corpo</dt>
        <dd>
          {editando ? (
            <textarea value={corpo} onChange={(e) => setCorpo(e.target.value)} rows={compact ? 8 : 12} aria-label="Mensagem" />
          ) : (
            <div className="nbaBody">
              {corpo
                .split(/\n\s*\n/)
                .map((b) => b.trim())
                .filter(Boolean)
                .map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
            </div>
          )}
        </dd>
      </dl>

      {erro ? <p className="osWarn" role="alert">{erro}</p> : null}

      <div className="nbaActs">
        {confirmar ? (
          <>
            <button className="osGo" type="button" disabled={pending} onClick={enviar}>
              {pending ? <Spinner label="Enviando" /> : null}
              Sim, enviar
            </button>
            <button className="osPageBtn" type="button" disabled={pending} onClick={() => setConfirmar(false)}>
              Afinal não
            </button>
          </>
        ) : (
          <>
            <button className="osGo" type="button" disabled={pending || corpo.trim().length < 10} onClick={() => setConfirmar(true)}>
              Enviar
            </button>
            <button className="osPageBtn" type="button" disabled={pending} onClick={() => setEditando((v) => !v)}>
              {editando ? 'Pronto' : 'Editar'}
            </button>
            <button className="focusSkip" type="button" disabled={pending} onClick={depois}>
              Depois
            </button>
            {compact ? (
              <Link className="chip" href={action.target.href ?? `/dashboard/inbox?thread=${threadId}`}>
                Abrir a conversa
              </Link>
            ) : null}
          </>
        )}
      </div>
      <p className="osRowSub nbaFoot">
        {compose
          ? 'Sai como conversa nova, para outra caixa. Nada sai sem o seu sim.'
          : 'Sai na mesma conversa. Nada sai sem o seu sim.'}
      </p>
    </section>
  );
}
