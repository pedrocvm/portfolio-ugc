'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Busy from './Busy';
import {
  addMedia,
  removeMedia,
  updateMedia,
} from '@/app/dashboard/library-actions';
import { KIND_LABEL, type MediaItem, type MediaKind } from '@/lib/library';
import { useUpload } from './MediaField';
import Segmented from './Segmented';
import Spinner from './Spinner';

const TODOS = '__todos__';
const SEM_NICHO = '__sem__';

export default function Library({
  items,
  niches,
}: {
  items: MediaItem[];
  niches: string[];
}) {
  const [kind, setKind] = useState<MediaKind>('video');
  const [filter, setFilter] = useState<string>(TODOS);
  const [niche, setNiche] = useState('');
  const [title, setTitle] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const { upload, busy, note, error } = useUpload();
  const [pending, start] = useTransition();
  const router = useRouter();

  const shown = items.filter(
    (i) =>
      i.kind === kind &&
      (filter === TODOS ||
        (filter === SEM_NICHO ? !i.niche : i.niche === filter)),
  );

  async function pick(file: File | undefined) {
    if (!file) return;
    const up = await upload(file);
    if (!up) return;
    start(async () => {
      const r = await addMedia({
        kind,
        url: up.url,
        storagePath: up.path,
        niche,
        title: title || file.name,
      });
      setMsg(r.error ?? 'Adicionado à biblioteca.');
      setTitle('');
      router.refresh();
    });
  }

  function edit(id: string, patch: { niche?: string; title?: string }) {
    start(async () => {
      const r = await updateMedia(id, patch);
      if (r.error) setMsg(r.error);
      router.refresh();
    });
  }

  function drop(item: MediaItem) {
    if (!confirm(`Apagar "${item.title}"? O ficheiro também é removido.`)) return;
    start(async () => {
      const r = await removeMedia(item.id);
      setMsg(r.error ?? 'Apagado.');
      router.refresh();
    });
  }

  return (
    <>
      <Busy on={pending} />
      <div className="dashBar">
        <h1>Biblioteca</h1>
        <span className="dashState">
          {pending || busy ? <Spinner label="A carregar" /> : null}
          {pending || busy
            ? (note ?? 'A processar')
            : `${shown.length} ${KIND_LABEL[kind].toLowerCase()}s`}
        </span>
      </div>

      <div className="libAdd">
        <div className="libAddRow">
          <Segmented
            label="Tipo de ficheiro"
            value={kind}
            onChange={setKind}
            options={[
              { id: 'video', label: 'Vídeos' },
              { id: 'photo', label: 'Fotos' },
            ]}
          />
          <select
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            aria-label="Nicho"
          >
            <option value="">Sem nicho</option>
            {niches.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={title}
            placeholder="Nome (opcional)"
            onChange={(e) => setTitle(e.target.value)}
          />
          <label className="btn tiny">
            {busy ? <Spinner label="A carregar" /> : null}
            {busy ? note : 'Carregar ficheiro'}
            <input
              type="file"
              accept={kind === 'video' ? 'video/*' : 'image/*'}
              onChange={(e) => {
                void pick(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
        </div>
        {error ? <p className="loginErr">{error}</p> : null}
        {msg ? <p className="hint">{msg}</p> : null}
      </div>

      <div className="libFilter">
        <button
          type="button"
          className={'chip' + (filter === TODOS ? ' on' : '')}
          onClick={() => setFilter(TODOS)}
        >
          Todos
        </button>
        {niches.map((n) => (
          <button
            key={n}
            type="button"
            className={'chip' + (filter === n ? ' on' : '')}
            onClick={() => setFilter(n)}
          >
            {n}
          </button>
        ))}
        <button
          type="button"
          className={'chip' + (filter === SEM_NICHO ? ' on' : '')}
          onClick={() => setFilter(SEM_NICHO)}
        >
          Sem nicho
        </button>
      </div>

      {shown.length === 0 ? (
        <p className="libEmpty">
          Ainda não há {KIND_LABEL[kind].toLowerCase()}s aqui. Carrega o
          primeiro acima.
        </p>
      ) : (
        <ul className="libGrid">
          {shown.map((it, i) => (
            <li
              key={it.id}
              className="libCard"
              style={{ '--g': Math.min(i, 12) } as React.CSSProperties}
            >
              <div className="libThumb">
                {it.kind === 'photo' ? (
                  <img src={it.url} alt="" loading="lazy" />
                ) : (
                  <video src={it.url} muted playsInline preload="metadata" />
                )}
              </div>
              <input
                type="text"
                defaultValue={it.title}
                aria-label="Nome"
                onBlur={(e) => {
                  if (e.target.value !== it.title) {
                    edit(it.id, { title: e.target.value });
                  }
                }}
              />
              <div className="libCardFoot">
                <select
                  defaultValue={it.niche}
                  aria-label="Nicho"
                  onChange={(e) => edit(it.id, { niche: e.target.value })}
                >
                  <option value="">Sem nicho</option>
                  {niches.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="icoBtn"
                  aria-label="Apagar"
                  onClick={() => drop(it)}
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
