'use client';

import { useEffect, useRef } from 'react';
import { hasDerivatives, derive } from '@/lib/media';

export default function Lightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    opener.current = document.activeElement;
    document.body.style.overflow = 'hidden';
    box.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [onClose]);

  const derived = hasDerivatives(src);

  return (
    <div className="lbox" role="dialog" aria-modal="true" aria-label={alt}>
      <button
        className="lboxScrim"
        type="button"
        aria-label="Fechar"
        onClick={onClose}
      />
      <div className="lboxBox" ref={box} tabIndex={-1}>
        <picture>
          {derived && <source srcSet={derive(src, 'avif')} type="image/avif" />}
          {derived && <source srcSet={derive(src, 'webp')} type="image/webp" />}
          <img src={src} alt={alt} />
        </picture>
        <button
          className="lboxX"
          type="button"
          aria-label="Fechar"
          onClick={onClose}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
