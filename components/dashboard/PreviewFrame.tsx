'use client';

import { useEffect, useRef, useState } from 'react';
import type { Content } from '@/lib/content';
import Segmented from './Segmented';
import { useExit } from './useExit';

const SIZES = [
  { id: 'desktop', label: 'Computador', width: '100%' },
  { id: 'tablet', label: 'Tablet', width: '834px' },
  { id: 'phone', label: 'Telemóvel', width: '390px' },
];

export default function PreviewFrame({
  content,
  dirty,
  onClose,
}: {
  content: Content;
  dirty: boolean;
  onClose: () => void;
}) {
  const [size, setSize] = useState(
    () =>
      (typeof window !== 'undefined' &&
        window.matchMedia('(max-width: 900px)').matches &&
        SIZES[2]) ||
      SIZES[0],
  );
  const [nonce, setNonce] = useState(0);
  const { closing, close } = useExit(onClose);
  const frame = useRef<HTMLIFrameElement>(null);

  /* a página lá dentro avisa quando está pronta; a partir daí cada tecla
     escrita no formulário chega-lhe sem passar pela base de dados */
  useEffect(() => {
    function onReady(e: MessageEvent) {
      if (e.origin !== window.location.origin || e.data?.type !== 'ready') return;
      (e.source as Window | null)?.postMessage(
        { type: 'draft', content },
        window.location.origin,
      );
    }
    window.addEventListener('message', onReady);
    return () => window.removeEventListener('message', onReady);
  }, [content]);

  useEffect(() => {
    const id = setTimeout(() => {
      frame.current?.contentWindow?.postMessage(
        { type: 'draft', content },
        window.location.origin,
      );
    }, 250);
    return () => clearTimeout(id);
  }, [content]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [close]);

  return (
    <div className="pv" data-closing={closing || undefined} role="dialog" aria-modal="true" aria-label="Pré-visualização">
      <button
        className="pickScrim"
        type="button"
        aria-label="Fechar"
        onClick={close}
      />
      <div className="pvBox">
        <div className="pvBar">
          <h2 className="pvTitle">Rascunho, ainda fora do ar</h2>
          <Segmented
            label="Tamanho do ecrã"
            value={size.id}
            onChange={(id) =>
              setSize(SIZES.find((s) => s.id === id) ?? SIZES[0])
            }
            options={SIZES.map((s) => ({ id: s.id, label: s.label }))}
          />
          <button
            type="button"
            className="btn tiny quiet"
            onClick={() => setNonce((n) => n + 1)}
          >
            Atualizar
          </button>
          <button
            type="button"
            className="icoBtn"
            aria-label="Fechar"
            onClick={close}
          >
            ✕
          </button>
        </div>
        {dirty ? (
          <p className="pvNote">
            Estás a ver as alterações que ainda não guardaste. O site só muda
            depois de Guardar e Publicar.
          </p>
        ) : null}
        <div className="pvFrame" style={{ maxWidth: size.width }}>
          <iframe
            key={`${size.id}-${nonce}`}
            ref={frame}
            src="/preview"
            title="Pré-visualização do site"
          />
        </div>
      </div>
    </div>
  );
}
