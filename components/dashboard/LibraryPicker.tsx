'use client';

import { useEffect, useState } from 'react';
import { useExit } from './useExit';
import { listMedia } from '@/app/dashboard/library-actions';
import type { MediaItem } from '@/lib/library';
import { isVideo } from '@/lib/media';

export default function LibraryPicker({
  accept,
  onPick,
  onClose,
}: {
  accept: 'image' | 'video' | 'media';
  onPick: (url: string) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const { closing, close } = useExit(onClose);

  useEffect(() => {
    listMedia().then(setItems);
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close]);

  const shown = (items ?? []).filter((i) =>
    accept === 'media'
      ? true
      : accept === 'video'
        ? i.kind === 'video'
        : i.kind === 'photo',
  );

  return (
    <div className="pick" data-closing={closing || undefined} role="dialog" aria-modal="true" aria-label="Biblioteca">
      <button className="pickScrim" type="button" aria-label="Fechar" onClick={close} />
      <div className="pickBox">
        <div className="pickHead">
          <h2 className="pickTitle">Biblioteca</h2>
          <button type="button" className="icoBtn" aria-label="Fechar" onClick={close}>
            ✕
          </button>
        </div>
        {items === null ? (
          <p className="hint">Carregando…</p>
        ) : shown.length === 0 ? (
          <p className="hint">
            A biblioteca ainda não tem nada deste tipo. Carrega arquivos na tela
            Biblioteca e volta aqui.
          </p>
        ) : (
          <ul className="pickGrid">
            {shown.map((it, i) => (
              <li
                key={it.id}
                style={{ '--g': Math.min(i, 12) } as React.CSSProperties}
              >
                <button type="button" onClick={() => onPick(it.url)}>
                  <span className="libThumb">
                    {isVideo(it.url) ? (
                      <video src={it.url} muted playsInline preload="metadata" />
                    ) : (
                      <img src={it.url} alt="" loading="lazy" />
                    )}
                  </span>
                  <span className="pickName">{it.title || 'Sem nome'}</span>
                  {it.niche ? <span className="pickNiche">{it.niche}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
