'use client';

import { useCallback, useRef, useState } from 'react';
import { addMedia } from '@/app/dashboard/library-actions';
import { compressVideo } from '@/lib/compress';
import { isVideo } from '@/lib/media';
import { COMPRESS_OVER, MAX_PICK, MAX_UPLOAD, mb } from '@/lib/media-limits';
import LibraryPicker from './LibraryPicker';
import VideoThumb from './VideoThumb';
import Viewer from './Viewer';

export function useUpload() {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(input: File) {
    if (input.size > MAX_PICK) {
      setError(
        `O arquivo tem ${mb(input.size)} MB e o limite é ${mb(MAX_PICK)} MB.`,
      );
      return null;
    }
    setBusy(true);
    setError(null);
    setNote('Carregando');

    let file = input;
    if (input.type.startsWith('video/') && input.size > COMPRESS_OVER) {
      setNote('Comprimindo 0%');
      file = await compressVideo(input, (r) =>
        setNote(`Comprimindo ${Math.round(r * 100)}%`),
      );
      setNote('Carregando');
    }

    if (file.size > MAX_UPLOAD) {
      setBusy(false);
      setNote(null);
      setError(
        file === input
          ? `O arquivo tem ${mb(file.size)} MB e o limite é ${mb(MAX_UPLOAD)} MB.`
          : `Mesmo comprimido o arquivo fica com ${mb(file.size)} MB e o limite é ${mb(MAX_UPLOAD)} MB. Corta o vídeo e tenta de novo.`,
      );
      return null;
    }

    /* O navegador nunca fala com o R2 nem vê uma credencial dele: pede ao
       servidor uma URL assinada para aquele nome, tipo e tamanho exatos, e
       só depois sobe o arquivo direto para ela. */
    const authRes = await fetch('/api/media/upload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        size: file.size,
      }),
    });
    const authJson: { uploadUrl?: string; path?: string; publicUrl?: string; error?: string } =
      await authRes.json().catch(() => ({ error: 'Resposta inválida do servidor.' }));
    if (!authRes.ok || !authJson.uploadUrl || !authJson.path || !authJson.publicUrl) {
      setBusy(false);
      setNote(null);
      setError(`Não foi possível preparar o upload. ${authJson.error ?? ''}`.trim());
      return null;
    }

    const putRes = await fetch(authJson.uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': file.type || 'application/octet-stream' },
      body: file,
    });
    setBusy(false);
    setNote(null);
    if (!putRes.ok) {
      setError(`Não foi possível carregar o arquivo. HTTP ${putRes.status}.`);
      return null;
    }
    return { url: authJson.publicUrl, path: authJson.path };
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
  const [warn, setWarn] = useState<string | null>(null);
  const [viewing, setViewing] = useState(false);
  const { upload, busy, note, error } = useUpload();
  const closePicker = useCallback(() => setPicking(false), []);

  async function pick(file: File | undefined) {
    if (!file) return;
    setWarn(null);
    const up = await upload(file);
    if (!up) return;
    onChange(up.url);
    /* Tudo o que sobe fica na Biblioteca, venha da tela Biblioteca ou daqui.
       Sem isto o arquivo só existia dentro deste campo. */
    const r = await addMedia({
      kind: isVideo(up.url) ? 'video' : 'photo',
      url: up.url,
      storagePath: up.path,
      niche: '',
      title: file.name,
    });
    if (r.error) setWarn('O arquivo entrou, mas não foi para a Biblioteca.');
  }

  return (
    <div className="fld wide">
      <span className="lb">{label}</span>
      <div className="media">
        {value && (kind === 'video' || (kind === 'media' && isVideo(value))) ? (
          <button
            type="button"
            className="mediaThumb play"
            aria-label={`Ver ${label}`}
            onClick={() => setViewing(true)}
          >
            <VideoThumb src={value} />
          </button>
        ) : (
          <div className="mediaThumb">
            {!value ? (
              <span className="none">Vazio</span>
            ) : (
              <img src={value} alt="" />
            )}
          </div>
        )}
        <div className="mediaBody">
          <div className="mediaRow">
            <button
              type="button"
              className="btn tiny"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              {busy ? `${note}…` : 'Escolher arquivo'}
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
            placeholder="Endereço do arquivo"
            onChange={(e) => onChange(e.target.value)}
          />
          {error ?? warn ? (
            <p className="loginErr">{error ?? warn}</p>
          ) : null}
          {hint ? <p className="hint">{hint}</p> : null}
        </div>
      </div>
      {viewing ? (
        <Viewer
          src={value}
          title={label}
          onClose={() => setViewing(false)}
        />
      ) : null}
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
