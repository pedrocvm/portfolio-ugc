'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  assistantMessages, assistantSuggestions, assistantThreads, deleteAssistantThread,
  openAssistantThread, titleAssistantThread,
} from '@/app/dashboard/assistant-actions';
import Spinner from '@/components/dashboard/Spinner';
import type { Source } from '@/modules/assistant/domain';
import { useAssistant, type ChatMessage } from './AssistantProvider';

/** A Carol AI. Botão à direita, painel que abre por cima sem tirar o CarolOS
 *  de baixo. */

const SOURCE_LABEL: Record<string, string> = {
  brand: 'Marca', opportunity: 'Oportunidade', email: 'Email', document: 'Documento',
  pricing: 'Preço', portfolio: 'Portfólio', memory: 'Memória', knowledge: 'Fonte',
  followup: 'Follow-up', case: 'Case',
};

function Sources({ sources }: { sources: Source[] }) {
  if (!sources.length) return null;
  return (
    <div className="aiSources">
      {sources.map((s) =>
        s.href ? (
          <Link className="aiSource" key={`${s.type}:${s.id}`} href={s.href}>
            {SOURCE_LABEL[s.type] ?? s.type} · {s.label}
          </Link>
        ) : (
          <span className="aiSource" key={`${s.type}:${s.id}`}>
            {SOURCE_LABEL[s.type] ?? s.type} · {s.label}
          </span>
        ),
      )}
    </div>
  );
}

export default function Assistant({ configured, pending = 0 }: { configured: boolean; pending?: number }) {
  const a = useAssistant();
  const [status, setStatus] = useState('');
  const [threads, setThreads] = useState<{ id: string; title: string }[]>([]);
  const [showList, setShowList] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [web, setWeb] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);

  // Só cola ao fundo se ela já lá estava: a ler uma resposta antiga, o scroll
  // automático seria a coisa mais irritante possível.
  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  useEffect(() => {
    if (stick.current) scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [a.messages]);

  useEffect(() => {
    if (!a.open) return;
    assistantSuggestions(a.entity.id ? a.entity.type : null).then(setSuggestions);
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') a.setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [a.open, a.entity.type, a.entity.id, a]);

  const upload = useCallback(
    async (list: FileList | File[]) => {
      let id = a.threadId;
      if (!id) {
        const created = await openAssistantThread(a.entity.id ? a.entity.type : null, a.entity.id);
        if ('error' in created) return setUploadError(created.error);
        id = created.id;
        a.setThreadId(id);
      }
      setUploadError('');
      for (const file of Array.from(list).slice(0, 5)) {
        const form = new FormData();
        form.set('threadId', id);
        form.set('file', file);
        const res = await fetch('/api/assistant/upload', { method: 'POST', body: form });
        const body = await res.json().catch(() => ({ error: 'Falhou.' }));
        if (!res.ok) setUploadError(body.error ?? 'Não consegui carregar o ficheiro.');
        else a.setFiles((f) => [...f, body]);
      }
    },
    [a],
  );

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || a.busy) return;

      const attachmentIds = a.files.map((f) => f.id);
      a.setDraft('');
      a.setFiles([]);
      a.setBusy(true);
      setStatus('');

      let threadId = a.threadId;
      if (!threadId) {
        const created = await openAssistantThread(a.entity.id ? a.entity.type : null, a.entity.id);
        if ('error' in created) {
          a.setBusy(false);
          a.setMessages((m) => [...m, { id: crypto.randomUUID(), role: 'assistant', content: '', error: created.error }]);
          return;
        }
        threadId = created.id;
        a.setThreadId(threadId);
        void titleAssistantThread(threadId, message);
      }

      const replyId = crypto.randomUUID();
      a.setMessages((m) => [
        ...m,
        { id: crypto.randomUUID(), role: 'user', content: message },
        { id: replyId, role: 'assistant', content: '', streaming: true },
      ]);

      const controller = new AbortController();
      a.abort.current = controller;

      try {
        const res = await fetch('/api/assistant/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            threadId, message,
            entity: a.entity.id ? a.entity : null,
            attachmentIds,
            webResearch: web,
          }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error('A Carol AI não respondeu.');

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split('\n\n');
          buffer = frames.pop() ?? '';

          for (const frame of frames) {
            const line = frame.replace(/^data: /, '').trim();
            if (!line) continue;
            const event = JSON.parse(line);

            if (event.type === 'delta') {
              setStatus('');
              a.setMessages((m) => m.map((x) => (x.id === replyId ? { ...x, content: x.content + event.text } : x)));
            } else if (event.type === 'status') {
              setStatus(event.label);
            } else if (event.type === 'sources') {
              a.setMessages((m) => m.map((x) => (x.id === replyId ? { ...x, sources: event.sources } : x)));
            } else if (event.type === 'error') {
              a.setMessages((m) => m.map((x) => (x.id === replyId ? { ...x, error: event.message, streaming: false } : x)));
            }
          }
        }
        a.setMessages((m) => m.map((x) => (x.id === replyId ? { ...x, streaming: false } : x)));
      } catch (error) {
        const aborted = error instanceof DOMException && error.name === 'AbortError';
        a.setMessages((m) =>
          m.map((x) =>
            x.id === replyId
              ? { ...x, streaming: false, error: aborted ? undefined : 'Falhou a meio. Tenta outra vez.' }
              : x,
          ),
        );
      } finally {
        a.setBusy(false);
        a.abort.current = null;
        setStatus('');
      }
    },
    [a, web],
  );

  async function pickThread(id: string) {
    a.setThreadId(id);
    setShowList(false);
    const rows = await assistantMessages(id);
    a.setMessages(
      rows
        .filter((r) => r.role !== 'tool')
        .map((r) => ({ id: r.id, role: r.role as ChatMessage['role'], content: r.content, sources: r.sources })),
    );
  }

  if (!a.open) {
    return (
      <button className="aiLauncher" type="button" style={{ position: 'fixed' }} onClick={() => a.setOpen(true)} aria-label="Abrir a Carol AI">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3.4c4.6 0 8.3 3.1 8.3 7s-3.7 7-8.3 7c-.9 0-1.8-.1-2.6-.4l-4 1.6 1.2-3.2c-1.8-1.3-2.9-3.1-2.9-5C3.7 6.5 7.4 3.4 12 3.4Z" />
        </svg>
        <span>Carol AI</span>
        {pending > 0 ? (
          <span className="aiBadge" aria-label={`${pending} avisos por ver`}>
            {pending > 9 ? '9+' : pending}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <aside
      className="aiPanel"
      role="dialog"
      aria-modal="false"
      aria-label="Carol AI"
      data-dragging={dragging || undefined}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files.length) void upload(e.dataTransfer.files);
      }}
    >
      <header className="aiHead">
        <div>
          <b>Carol AI</b>
          {a.entity.id ? <span className="aiCtx">no que estás a ver</span> : null}
        </div>
        <div className="aiHeadActs">
          <button
            className="chip"
            type="button"
            onClick={async () => {
              setShowList((v) => !v);
              if (!showList) setThreads(await assistantThreads());
            }}
          >
            Conversas
          </button>
          <button className="chip" type="button" onClick={a.reset}>
            Nova
          </button>
          <button className="chip" type="button" onClick={() => a.setOpen(false)}>
            Fechar
          </button>
        </div>
      </header>

      {!configured ? (
        <p className="osWarn">
          Falta a chave da Anthropic no ambiente. A Carol AI está montada, mas não fala até
          <code> ANTHROPIC_API_KEY </code> estar configurada.
        </p>
      ) : null}

      {showList ? (
        <div className="aiThreads">
          {threads.length === 0 ? <p className="osRowSub">Ainda não há conversas.</p> : null}
          {threads.map((t) => (
            <div className="aiThread" key={t.id}>
              <button type="button" onClick={() => pickThread(t.id)}>
                {t.title || 'Sem título'}
              </button>
              <button
                type="button"
                aria-label={`Apagar ${t.title || 'conversa'}`}
                onClick={async () => {
                  await deleteAssistantThread(t.id);
                  setThreads((list) => list.filter((x) => x.id !== t.id));
                  if (a.threadId === t.id) a.reset();
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="aiScroll" ref={scroller} onScroll={onScroll}>
        {a.messages.length === 0 ? (
          <div className="aiEmpty">
            <p>Pergunta-me o que quiseres sobre o teu negócio. Eu vou ver os dados antes de responder.</p>
            <div className="aiChips">
              {suggestions.map((s) => (
                <button key={s} className="aiChip" type="button" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {a.messages.map((m) => (
          <article className="aiMsg" key={m.id} data-role={m.role}>
            {m.role === 'assistant' ? (
              <>
                <div className="aiBody">
                  <Markdown remarkPlugins={[remarkGfm]}>{m.content}</Markdown>
                </div>
                {m.streaming && !m.content ? (
                  <p className="osRowSub">
                    <Spinner label="A pensar" />
                    {status || 'A pensar…'}
                  </p>
                ) : null}
                {m.error ? <p className="osWarn">{m.error}</p> : null}
                <Sources sources={m.sources ?? []} />
                {!m.streaming && m.content ? (
                  <button className="aiCopy" type="button" onClick={() => navigator.clipboard?.writeText(m.content)}>
                    Copiar
                  </button>
                ) : null}
              </>
            ) : (
              <p className="aiSaid">{m.content}</p>
            )}
          </article>
        ))}
      </div>

      <form
        className="aiComposer"
        onSubmit={(e) => {
          e.preventDefault();
          send(a.draft);
        }}
      >
        <label className="visually-hidden" htmlFor="aiInput">
          Pergunta
        </label>
        <textarea
          id="aiInput"
          ref={input}
          rows={2}
          value={a.draft}
          placeholder="Pergunta sobre marcas, preços, emails…"
          onChange={(e) => a.setDraft(e.target.value)}
          onPaste={(e) => {
            // Colar um print é como a maior parte das capturas acontece.
            const files = [...e.clipboardData.files];
            if (files.length) {
              e.preventDefault();
              void upload(files);
            }
          }}
          onKeyDown={(e) => {
            // Enter envia, Shift+Enter muda de linha. É o que os dedos esperam.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(a.draft);
            }
          }}
        />
        {a.files.length ? (
          <div className="aiFiles">
            {a.files.map((f) => (
              <span className="aiFile" key={f.id}>
                {f.fileName}
                <button
                  type="button"
                  aria-label={`Tirar ${f.fileName}`}
                  onClick={() => a.setFiles((list) => list.filter((x) => x.id !== f.id))}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}
        {uploadError ? <p className="osWarn">{uploadError}</p> : null}

        <div className="aiComposerActs">
          <label className="aiAttach">
            <input
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,text/markdown,text/csv"
              onChange={(e) => {
                if (e.target.files?.length) void upload(e.target.files);
                e.target.value = '';
              }}
            />
            Anexar
          </label>
          <button
            className="aiWeb"
            type="button"
            aria-pressed={web}
            onClick={() => setWeb((v) => !v)}
            title="Deixar procurar na web para pesquisa de marcas e produtos"
          >
            Web
          </button>
          <span className="aiSpacer" />
          {a.busy ? (
            <button className="chip" type="button" onClick={() => a.abort.current?.abort()}>
              Parar
            </button>
          ) : null}
          <button className="osPageBtn" type="submit" disabled={a.busy || a.draft.trim().length === 0}>
            {a.busy ? <Spinner label="A responder" /> : null}
            Perguntar
          </button>
        </div>
      </form>
    </aside>
  );
}
