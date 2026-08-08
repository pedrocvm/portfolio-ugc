'use client';

import { useEffect, useState } from 'react';

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

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="pv" role="dialog" aria-modal="true" aria-label="Pré-visualização">
      <button
        className="pickScrim"
        type="button"
        aria-label="Fechar"
        onClick={onClose}
      />
      <div className="pvBox">
        <div className="pvBar">
          <h2 className="pvTitle">Rascunho, ainda fora do ar</h2>
          {SIZES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={'btn tiny' + (s.id === size.id ? ' solid' : '')}
              onClick={() => setSize(s)}
            >
              {s.label}
            </button>
          ))}
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
            onClick={onClose}
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
