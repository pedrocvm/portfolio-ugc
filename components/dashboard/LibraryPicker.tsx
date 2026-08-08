'use client';

import { useEffect, useState } from 'react';
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

  useEffect(() => {
    listMedia().then(setItems);
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const shown = (items ?? []).filter((i) =>
    accept === 'media'
      ? true
      : accept === 'video'
        ? i.kind === 'video'
        : i.kind === 'photo',
  );

  return (
    <div className="pick" role="dialog" aria-modal="true" aria-label="Biblioteca">
      <button className="pickScrim" type="button" aria-label="Fechar" onClick={onClose} />
      <div className="pickBox">
        <div className="pickHead">
          <h2 className="pickTitle">Biblioteca</h2>
          <button type="button" className="icoBtn" aria-label="Fechar" onClick={onClose}>
            ✕
          </button>
        </div>
        {items === null ? (
          <p className="hint">A carregar…</p>
        ) : shown.length === 0 ? (
          <p className="hint">
            A biblioteca ainda não tem nada deste tipo. Carrega ficheiros no ecrã
            Biblioteca e volta aqui.
          </p>
        ) : (
          <ul className="pickGrid">
            {shown.map((it) => (
              <li key={it.id}>
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
