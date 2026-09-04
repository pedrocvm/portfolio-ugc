'use client';

import { useState, useTransition } from 'react';
import Spinner from '@/components/dashboard/Spinner';
import { pushToast } from '@/components/dashboard/Toasts';
import { pasteInsights } from '@/app/dashboard/content-actions';
import { useCaptureUpload } from './useCaptureUpload';

/** Colar um print dos Insights. Zero formulário: o modelo lê os números, e
 *  só o que ficou ambíguo é que aparece para ela confirmar. */
export default function InsightsDrop({ ideaId, compact }: { ideaId: string | null; compact?: boolean }) {
  const { upload, busy, error } = useCaptureUpload('insights');
  const [pending, start] = useTransition();
  const [resultado, setResultado] = useState<string | null>(null);
  const [duvidas, setDuvidas] = useState<string[]>([]);

  const ler = (file: File) =>
    start(async () => {
      setResultado(null);
      setDuvidas([]);
      const up = await upload(file);
      if (!up) return;
      const r = await pasteInsights({ path: up.path, ideaId }).catch((): { error: string } => ({ error: 'Não consegui ler o print agora.' }));
      if ('error' in r) {
        setResultado(r.error);
        return;
      }
      const partes = [
        r.views !== null ? `${r.views} views` : '',
        r.reach !== null ? `${r.reach} contas` : '',
        r.nonFollowers !== null ? `${r.nonFollowers} não seguidores` : '',
      ].filter(Boolean);
      setResultado(r.recorded ? `Registado: ${partes.join(' · ') || 'sem views no print'}. ${r.verdict ?? ''}` : `Li ${partes.join(' · ') || 'o print'}, mas sem saber de que peça é não registei nada.`);
      setDuvidas(r.ambiguities);
      if (r.recorded) pushToast('Números registados.');
    });

  const onFile = (f: File | undefined) => {
    if (f && f.type.startsWith('image/')) void ler(f);
  };

  return (
    <div
      className={`csDrop${compact ? ' csDropCompact' : ''}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onFile(e.dataTransfer.files[0]);
      }}
      onPaste={(e) => {
        const img = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'));
        const f = img?.getAsFile();
        if (f) {
          e.preventDefault();
          onFile(f);
        }
      }}
      tabIndex={0}
      aria-label="Colar ou soltar um print dos Insights"
    >
      <label className="csDropLabel">
        {busy || pending ? <Spinner label="Lendo o print" /> : null}
        {compact ? 'Colar print dos Insights' : 'Cole aqui um print dos Insights, ou solte a imagem. Eu leio os números.'}
        <input type="file" accept="image/*" onChange={(e) => onFile(e.target.files?.[0])} hidden />
      </label>
      {error ? <p className="osWarn" role="alert">{error}</p> : null}
      {resultado ? <p className="osRowSub">{resultado}</p> : null}
      {duvidas.length ? (
        <p className="osRowSub">
          Não consegui ler com certeza: {duvidas.join('; ')}. Se importar, diga à Carol AI o número certo.
        </p>
      ) : null}
    </div>
  );
}
