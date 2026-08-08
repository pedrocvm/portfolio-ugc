'use client';

import { useCallback, useRef, useState } from 'react';
import { isVideo } from '@/lib/media';
import { supabaseBrowser } from '@/lib/supabase/browser';
import LibraryPicker from './LibraryPicker';

const slug = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9.]+/g, '-')
    .toLowerCase();

export function useUpload() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    const supabase = supabaseBrowser();
    const path = `${Date.now()}-${slug(file.name)}`;
    const { error: err } = await supabase.storage
      .from('media')
      .upload(path, file, { cacheControl: '31536000', upsert: false });
    setBusy(false);
    if (err) {
      setError('Não foi possível carregar o ficheiro.');
      return null;
    }
    const { publicUrl } = supabase.storage.from('media').getPublicUrl(path).data;
    return { url: publicUrl, path };
  }

  return { upload, busy, error };
}

const ACCEPT = {
  image: 'image/*',
  video: 'video/*',
  media: 'image/*,video/*',
} as const;

type Props = {
  label: string;
  hint?: string;
  kind: 'image' | 'video' | 'media';
  value: string;
  onChange: (v: string) => void;
};

export default function MediaField({
  label,
  hint,
  kind,
  value,
  onChange,
}: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [picking, setPicking] = useState(false);
  const { upload, busy, error } = useUpload();
  const closePicker = useCallback(() => setPicking(false), []);

  async function pick(file: File | undefined) {
    if (!file) return;
    const up = await upload(file);
    if (up) onChange(up.url);
  }

  return (
    <div className="fld wide">
      <span className="lb">{label}</span>
      <div className="media">
        <div className="mediaThumb">
          {!value ? (
            <span className="none">Vazio</span>
          ) : kind === 'video' || (kind === 'media' && isVideo(value)) ? (
            <video src={value} muted playsInline preload="metadata" />
          ) : (
            <img src={value} alt="" />
          )}
        </div>
        <div className="mediaBody">
          <div className="mediaRow">
            <button
              type="button"
              className="btn tiny"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              {busy ? 'A carregar…' : 'Escolher ficheiro'}
            </button>
            <button
              type="button"
              className="btn tiny"
              onClick={() => setPicking(true)}
            >
              Da biblioteca
            </button>
            {value ? (
              <button
                type="button"
                className="btn tiny quiet"
                onClick={() => onChange('')}
              >
                Remover
              </button>
            ) : null}
            <input
              ref={input}
              type="file"
              accept={ACCEPT[kind]}
              onChange={(e) => {
                void pick(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>
          <input
            type="text"
            value={value}
            placeholder="Endereço do ficheiro"
            onChange={(e) => onChange(e.target.value)}
          />
          {error ? <p className="loginErr">{error}</p> : null}
          {hint ? <p className="hint">{hint}</p> : null}
        </div>
      </div>
      {picking ? (
        <LibraryPicker
          accept={kind}
          onClose={closePicker}
          onPick={(url) => {
            onChange(url);
            setPicking(false);
          }}
        />
      ) : null}
    </div>
  );
}
