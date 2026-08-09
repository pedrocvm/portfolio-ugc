'use client';

import { useCallback, useRef, useState } from 'react';
import { compressVideo } from '@/lib/compress';
import { isVideo } from '@/lib/media';
import { supabaseBrowser } from '@/lib/supabase/browser';
import LibraryPicker from './LibraryPicker';

const slug = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9.]+/g, '-')
    .toLowerCase();

/** ponytail: o teto de 50 MB é o do plano gratuito do Supabase, igual para
 *  todos os buckets. Se o projeto passar a Pro, sobe aqui e nas definições de
 *  Storage. Sem esta guarda o pedido só volta com 413 e uma frase em inglês. */
const MAX_UPLOAD = 50 * 1024 * 1024;
/** O que ela pode escolher: acima disto o browser engasga-se a descodificar. */
const MAX_PICK = 100 * 1024 * 1024;
/** Abaixo disto o vídeo já serve para a web e comprimir só custa tempo a ela. */
const COMPRESS_OVER = 20 * 1024 * 1024;
const mb = (n: number) => Math.round(n / 1024 / 1024);

export function useUpload() {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(input: File) {
    if (input.size > MAX_PICK) {
      setError(
        `O ficheiro tem ${mb(input.size)} MB e o limite é ${mb(MAX_PICK)} MB.`,
      );
      return null;
    }
    setBusy(true);
    setError(null);
    setNote('A carregar');

    let file = input;
    if (input.type.startsWith('video/') && input.size > COMPRESS_OVER) {
      setNote('A comprimir 0%');
      file = await compressVideo(input, (r) =>
        setNote(`A comprimir ${Math.round(r * 100)}%`),
      );
      setNote('A carregar');
    }

    if (file.size > MAX_UPLOAD) {
      setBusy(false);
      setNote(null);
      setError(
        file === input
          ? `O ficheiro tem ${mb(file.size)} MB e o limite é ${mb(MAX_UPLOAD)} MB.`
          : `Mesmo comprimido o ficheiro fica com ${mb(file.size)} MB e o limite é ${mb(MAX_UPLOAD)} MB. Corta o vídeo e tenta de novo.`,
      );
      return null;
    }

    const supabase = supabaseBrowser();
    const path = `${Date.now()}-${slug(file.name)}`;
    const { error: err } = await supabase.storage
      .from('media')
      .upload(path, file, { cacheControl: '31536000', upsert: false });
    setBusy(false);
    setNote(null);
    if (err) {
      setError(`Não foi possível carregar o ficheiro. ${err.message}`);
      return null;
    }
    const { publicUrl } = supabase.storage.from('media').getPublicUrl(path).data;
    return { url: publicUrl, path };
  }

  return { upload, busy, note, error };
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
  const { upload, busy, note, error } = useUpload();
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
              {busy ? `${note}…` : 'Escolher ficheiro'}
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
