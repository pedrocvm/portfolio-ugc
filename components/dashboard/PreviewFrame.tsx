'use client';

import { useEffect, useState } from 'react';
import Segmented from './Segmented';
import { useExit } from './useExit';

const SIZES = [
  { id: 'desktop', label: 'Computador', width: '100%' },
  { id: 'tablet', label: 'Tablet', width: '834px' },
  { id: 'phone', label: 'Telemóvel', width: '390px' },
];

export default function PreviewFrame({
  dirty,
  onClose,
}: {
  dirty: boolean;
  onClose: () => void;
}) {
  const [size, setSize] = useState(SIZES[0]);
  const [nonce, setNonce] = useState(0);
  const { closing, close } = useExit(onClose);

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
            Estás a ver o último rascunho guardado. Guarda para veres as
            alterações que acabaste de fazer.
          </p>
        ) : null}
        <div className="pvFrame" style={{ maxWidth: size.width }}>
          <iframe
            key={`${size.id}-${nonce}`}
            src="/preview"
            title="Pré-visualização do site"
          />
        </div>
      </div>
    </div>
  );
}
