'use client';

import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';

/** Sobe um arquivo para o bucket privado `capture` a partir do browser.
 *
 *  Um print dos Insights ou um take de B-roll passam por aqui em vez de por
 *  uma Server Action, que tem teto de corpo pequeno. O bucket é privado e a
 *  política só deixa a sessão dela escrever; o servidor lê depois pelo caminho. */
const MAX = 50 * 1024 * 1024;

const slug = (name: string) =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9.]+/g, '-').toLowerCase();

export function useCaptureUpload(prefix: string) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File): Promise<{ path: string; name: string } | null> {
    if (file.size > MAX) {
      setError(`O arquivo tem ${Math.round(file.size / 1024 / 1024)} MB e o limite é 50 MB.`);
      return null;
    }
    setBusy(true);
    setError(null);
    const path = `${prefix}/${Date.now()}-${slug(file.name || 'print.png')}`;
    const { error: err } = await supabaseBrowser().storage.from('capture').upload(path, file, { contentType: file.type, upsert: false });
    setBusy(false);
    if (err) {
      setError(`Não consegui subir o arquivo. ${err.message}`);
      return null;
    }
    return { path, name: file.name };
  }

  return { upload, busy, error };
}
