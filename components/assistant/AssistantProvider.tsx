'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { Source } from '@/modules/assistant/domain';

/** O estado do chat vive aqui, no layout privado, e não na página.
 *
 *  É o que faz a conversa sobreviver a mudar de tela: a Carol abre a Cecotec,
 *  pergunta uma coisa, vai ao preço, volta — e a conversa está onde estava,
 *  com o rascunho por enviar. */

export type Attached = { id: string; kind: string; fileName: string; byteSize: number };

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  streaming?: boolean;
  error?: string;
};

type Ctx = {
  open: boolean;
  setOpen: (v: boolean) => void;
  entity: { type: string; id: string | null };
  threadId: string | null;
  setThreadId: (id: string | null) => void;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  draft: string;
  setDraft: (v: string) => void;
  /** Arquivos já carregados e ainda por enviar. Sobrevivem à navegação como o
   *  rascunho: perder um anexo por mudar de tela seria inaceitável. */
  files: Attached[];
  setFiles: React.Dispatch<React.SetStateAction<Attached[]>>;
  busy: boolean;
  setBusy: (v: boolean) => void;
  /** Uma resposta que acabou enquanto o painel estava fechado. Ela fez a
   *  pergunta, foi fazer outra coisa, e tem de haver forma de saber que já
   *  está — senão espera a olhar para um botão que não muda. */
  unread: boolean;
  setUnread: (v: boolean) => void;
  abort: React.MutableRefObject<AbortController | null>;
  reset: () => void;
};

const AssistantCtx = createContext<Ctx | null>(null);

/** O contexto vem da rota, não de cada página chamar um registador. Menos
 *  acoplamento, e não há forma de uma página se esquecer de o fazer. */
function entityFromPath(path: string): { type: string; id: string | null } {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const parts = path.replace(/^\/dashboard\/?/, '').split('/').filter(Boolean);
  const [head, second] = parts;
  const id = second && uuid.test(second) ? second : null;

  if (head === 'brands' && id) return { type: 'brand', id };
  if (head === 'opportunities' && id) return { type: 'opportunity', id };
  if (head === 'production' && id) return { type: 'collaboration', id };
  if (head === 'documents') return { type: 'document', id };
  if (head === 'content') return { type: 'content', id };
  if (head === 'inbox') return { type: 'inbox', id: null };
  if (!head) return { type: 'today', id: null };
  return { type: 'other', id: null };
}

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [files, setFiles] = useState<Attached[]>([]);
  const [busy, setBusy] = useState(false);
  const [unread, setUnread] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const entity = useMemo(() => entityFromPath(path), [path]);

  const reset = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    setThreadId(null);
    setMessages([]);
    setDraft('');
    setFiles([]);
    setBusy(false);
    setUnread(false);
  }, []);

  const value = useMemo(
    () => ({ open, setOpen, entity, threadId, setThreadId, messages, setMessages, draft, setDraft, files, setFiles, busy, setBusy, unread, setUnread, abort, reset }),
    [open, entity, threadId, messages, draft, files, busy, unread, reset],
  );

  return <AssistantCtx.Provider value={value}>{children}</AssistantCtx.Provider>;
}

export function useAssistant() {
  const ctx = useContext(AssistantCtx);
  if (!ctx) throw new Error('useAssistant fora do AssistantProvider');
  return ctx;
}

export { entityFromPath };
