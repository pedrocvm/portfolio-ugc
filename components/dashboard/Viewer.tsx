'use client';

import { useEffect } from 'react';
import { useExit } from './useExit';

/** Uma miniatura de 140 px não chega para um controlador: num vídeo vertical o
 *  Chrome deixa cair a barra de progresso e sobra o botão de reprodução. Aqui o
 *  vídeo abre com espaço, e os controlos do sistema ficam todos à mão. */
export default function Viewer({
  src,
  title,
  onClose,
}: {
  src: string;
  title: string;
  onClose: () => void;
}) {
  const { closing, close } = useExit(onClose);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close]);

  return (
    <div
      className="pick"
      data-closing={closing || undefined}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        className="pickScrim"
        type="button"
        aria-label="Fechar"
        onClick={close}
      />
      <div className="pickBox viewBox">
        <div className="pickHead">
          <h2 className="pickTitle">{title}</h2>
          <button
            type="button"
            className="icoBtn"
            aria-label="Fechar"
            onClick={close}
          >
            ✕
          </button>
        </div>
        <video src={src} controls autoPlay playsInline />
      </div>
    </div>
  );
}
