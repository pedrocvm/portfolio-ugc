'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDate } from '@/lib/time';

/** A conversa inteira, à vista.
 *
 *  Estava dobrada atrás de «Ver a conversa (14)», dentro de uma gaveta. Uma
 *  recomendação que aponta para um email que ninguém consegue abrir é uma
 *  recomendação em que ninguém confia.
 *
 *  Cronológica, com quem está nela, quem escreveu por último, e uma busca
 *  que filtra sem ir ao servidor — catorze emails cabem na memória. Cada
 *  mensagem tem âncora: «Ver email original» leva aqui e acende-a. */

export type ConversationMessage = {
  id: string;
  direction: 'inbound' | 'outbound';
  sentAt: string;
  fromAddress: string;
  fromName: string;
  subject: string;
  body: string;
};

export default function Conversation({
  messages,
  brandName,
  focusId,
  compact = false,
}: {
  messages: ConversationMessage[];
  brandName?: string | null;
  /** A mensagem a acender. Muda quando ela carrega em «Ver email original». */
  focusId?: string | null;
  /** Nas telas de marca: sem busca e com o corpo dobrado por mensagem. */
  compact?: boolean;
}) {
  const [q, setQ] = useState('');
  const box = useRef<HTMLDivElement>(null);

  const ordenadas = useMemo(() => [...messages].sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt)), [messages]);
  const ultima = ordenadas[ordenadas.length - 1] ?? null;

  const participantes = useMemo(() => {
    const vistos = new Map<string, string>();
    for (const m of ordenadas) {
      const chave = m.direction === 'outbound' ? 'eu' : m.fromAddress.toLowerCase();
      if (!vistos.has(chave)) vistos.set(chave, m.direction === 'outbound' ? 'Eu' : m.fromName || m.fromAddress);
    }
    return [...vistos.values()];
  }, [ordenadas]);

  const termo = q.trim().toLowerCase();
  const visiveis = termo
    ? ordenadas.filter((m) => `${m.subject} ${m.body} ${m.fromName} ${m.fromAddress}`.toLowerCase().includes(termo))
    : ordenadas;

  useEffect(() => {
    if (!focusId) return;
    const el = box.current?.querySelector<HTMLElement>(`[data-msg="${focusId}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el?.focus();
  }, [focusId]);

  if (ordenadas.length === 0) {
    return <p className="osRowSub">Esta conversa não tem mensagens salvas.</p>;
  }

  const quemEspera =
    ultima?.direction === 'inbound'
      ? `A última é da ${brandName ?? 'marca'}. A vez é sua.`
      : `A última é sua. A vez é da ${brandName ?? 'marca'}.`;

  return (
    <div className="convo" ref={box} data-compact={compact || undefined}>
      <div className="convoHead">
        <p className="convoWho">
          {participantes.join(' · ')}
          <span> · {ordenadas.length} {ordenadas.length === 1 ? 'mensagem' : 'mensagens'}</span>
        </p>
        <p className="convoTurn">{quemEspera}</p>
        {!compact && ordenadas.length > 2 ? (
          <label className="convoSearch">
            <span className="cbHidden">Procurar na conversa</span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Procurar nesta conversa"
            />
          </label>
        ) : null}
      </div>

      {visiveis.length === 0 ? <p className="osRowSub">Nada nesta conversa com «{q}».</p> : null}

      {visiveis.map((m) => {
        const eu = m.direction === 'outbound';
        const recente = m.id === ultima?.id;
        return (
          <article
            className="mailMsg"
            key={m.id}
            data-dir={m.direction}
            data-msg={m.id}
            data-latest={recente || undefined}
            data-focus={focusId === m.id || undefined}
            tabIndex={-1}
          >
            <div className="mailMeta">
              <b>{eu ? 'Eu' : m.fromName || m.fromAddress}</b>
              <span>
                {formatDate(m.sentAt)}
                {!eu && m.fromName ? ` · ${m.fromAddress}` : ''}
                {recente ? ' · mais recente' : ''}
              </span>
            </div>
            {compact ? (
              <details className="convoFold" open={recente}>
                <summary>{m.subject || (m.body.slice(0, 90) + (m.body.length > 90 ? '…' : ''))}</summary>
                <p className="mailBody">{m.body || m.subject}</p>
              </details>
            ) : (
              <p className="mailBody">{m.body || m.subject}</p>
            )}
          </article>
        );
      })}
    </div>
  );
}
