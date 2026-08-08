'use client';

import { useState } from 'react';

const SIZES = [
  { id: 'desktop', label: 'Computador', width: '100%' },
  { id: 'tablet', label: 'Tablet', width: '834px' },
  { id: 'phone', label: 'Telemóvel', width: '390px' },
];

export default function PreviewFrame() {
  const [size, setSize] = useState(SIZES[0]);
  const [nonce, setNonce] = useState(0);

  return (
    <>
      <div className="pvBar">
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
      </div>
      <div className="pvFrame" style={{ maxWidth: size.width }}>
        <iframe
          key={`${size.id}-${nonce}`}
          src="/preview"
          title="Pré-visualização do site"
        />
      </div>
    </>
  );
}
