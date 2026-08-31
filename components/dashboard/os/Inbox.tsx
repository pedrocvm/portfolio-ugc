'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { triageThread } from '@/app/dashboard/carolos-actions';
import { REPLY_TYPE_LABEL, type ReplyType } from '@/modules/ai/schemas';
import { STAGE_LABEL, type Stage } from '@/modules/opportunities/domain';
import type { ThreadRow } from '@/modules/inbox/queries';
import MailThread from './MailThread';

/** Inbox comercial. Três montes:
 *  — a marca falou e espera resposta;
 *  — o sistema não teve confiança para decidir sozinho;
 *  — está tudo do lado dela.
 *
 *  O terceiro monte existe para se poder ignorar. É o mais longo e o menos
 *  importante. */

function when(at: string | null) {
  if (!at) return '';
  const days = Math.round((Date.now() - new Date(at).getTime()) / 86400000);
  if (days <= 0) return 'hoje';
  if (days === 1) return 'ontem';
  return `há ${days} dias`;
}

function Thread({ thread, onOpen }: { thread: ThreadRow; onOpen: (id: string) => void }) {
  // A linha é um email, por isso carregar nela abre o email. Os atalhos para a
  // marca e para a oportunidade estão dentro do modal.
  return (
    <button className="osRow osRowBtn" type="button" onClick={() => onOpen(thread.id)}>
      <div>
        <span className="osRowName">{thread.brandName ?? thread.subject}</span>
        <p className="osRowSub">
          {thread.snippet.slice(0, 180) || thread.subject}
        </p>
        {thread.replyTypes.length ? (
          <div className="osMeta">
            {thread.replyTypes.map((t) => (
              <span key={t} className="osTag" data-tone="hot">
                {REPLY_TYPE_LABEL[t as ReplyType] ?? t}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="osRowSide">
        {thread.stage ? (
          <span className="osTag" data-tone="mute">
            {STAGE_LABEL[thread.stage as Stage] ?? thread.stage}
          </span>
        ) : null}
        <span>{when(thread.lastMessageAt)}</span>
      </div>
    </button>
  );
}

function ReviewThread({ thread, onOpen }: { thread: ThreadRow; onOpen: (id: string) => void }) {
  const [pending, start] = useTransition();
  const [gone, setGone] = useState(false);
  if (gone) return null;

  const decide = (decision: 'commercial' | 'irrelevant') =>
    start(async () => {
      await triageThread(thread.id, decision);
      setGone(true);
    });

  return (
    <article className="osCard">
      <div className="osCardMain">
        <div className="osCardTop">
          <span className="osBrand">{thread.participants[0] ?? thread.provider}</span>
          {typeof thread.confidence === 'number' ? (
            <span className="osTag" data-tone="mute">
              confiança {Math.round(thread.confidence * 100)}%
            </span>
          ) : null}
        </div>
        <h3>{thread.subject}</h3>
        <p className="osWhy">{thread.snippet.slice(0, 240) || 'Sem pré-visualização.'}</p>
        {thread.reason ? <div className="osMeta"><span>{thread.reason}</span></div> : null}
      </div>
      <div className="osCardActs">
        <button className="btn" type="button" disabled={pending} onClick={() => decide('commercial')}>
          É trabalho
        </button>
        <button className="chip" type="button" disabled={pending} onClick={() => decide('irrelevant')}>
          Não é
        </button>
        {/* Decidir sem ler é adivinhar: o email fica a um toque. */}
        <button className="chip" type="button" onClick={() => onOpen(thread.id)}>
          Ler o email
        </button>
      </div>
    </article>
  );
}

export default function Inbox({
  waiting,
  review,
  quiet,
  gmailConnected,
}: {
  waiting: ThreadRow[];
  review: ThreadRow[];
  quiet: ThreadRow[];
  gmailConnected: boolean;
}) {
  const [openThread, setOpenThread] = useState<string | null>(null);

  return (
    <>
      <div className="dashBar">
        <h1>Inbox</h1>
        <span className="dashState">{waiting.length} esperando por você</span>
      </div>

      {!gmailConnected ? (
        <p className="osWarn" data-tone="info">
          O Gmail ainda não está ligado, por isso esta caixa só tem o que entrou pela{' '}
          <Link href="/dashboard/capture">captura rápida</Link>. Ligar em{' '}
          <Link href="/dashboard/settings">Definições</Link> faz as conversas aparecerem sozinhas.
        </p>
      ) : null}

      <section className="osSection">
        <h2>Esperando por você</h2>
        <p className="osNote">A marca falou por último. Enquanto não responderes, a bola é tua.</p>
        {waiting.length ? (
          <div className="osRows">
            {waiting.map((t) => (
              <Thread key={t.id} thread={t} onOpen={setOpenThread} />
            ))}
          </div>
        ) : (
          <p className="osEmpty">Nenhuma conversa pendente.</p>
        )}
      </section>

      {review.length ? (
        <section className="osSection">
          <h2>Não tive a certeza</h2>
          <p className="osNote">
            O sistema não teve confiança suficiente para criar uma marca sozinho. Um toque resolve —
            e a decisão passa a valer para as mensagens seguintes desta conversa.
          </p>
          <div className="osQueue">
            {review.map((t) => (
              <ReviewThread key={t.id} thread={t} onOpen={setOpenThread} />
            ))}
          </div>
        </section>
      ) : null}

      {quiet.length ? (
        <section className="osSection">
          <h2>À espera da marca</h2>
          <p className="osNote">Já respondeste. O follow-up é agendado sozinho.</p>
          <div className="osRows">
            {quiet.map((t) => (
              <Thread key={t.id} thread={t} onOpen={setOpenThread} />
            ))}
          </div>
        </section>
      ) : null}

      {openThread ? (
        <MailThread threadId={openThread} onClose={() => setOpenThread(null)} />
      ) : null}
    </>
  );
}
