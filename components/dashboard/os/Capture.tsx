'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { capture, confirmCapture, dropCapture, uploadScreenshot } from '@/app/dashboard/carolos-actions';
import { prospectableNiches } from '@/modules/brands/niches';
import { label } from '@/lib/labels';
import type { CaptureDraft } from '@/modules/capture/service';

/** Captura rápida.
 *
 *  O objectivo é dez segundos: colar e confirmar. Não há campos obrigatórios,
 *  não há formulário de marca. O que o sistema conseguir ler, lê; o que não
 *  conseguir, pergunta numa linha. */

const KINDS = [
  { id: 'url', label: 'Link' },
  { id: 'conversation', label: 'Conversa' },
  { id: 'profile', label: 'Perfil' },
  { id: 'product', label: 'Produto' },
  { id: 'brief', label: 'Briefing' },
  { id: 'screenshot', label: 'Print' },
  { id: 'text', label: 'Outro' },
] as const;

export default function Capture({ drafts }: { drafts: CaptureDraft[] }) {
  const [pending, start] = useTransition();
  const [kind, setKind] = useState<string>('url');
  const [raw, setRaw] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const router = useRouter();

  const submit = () =>
    start(async () => {
      setError('');

      // O print sobe primeiro, para o bucket privado; a captura guarda só o
      // caminho. O ficheiro nunca passa por uma tabela.
      let storagePath: string | null = null;
      if (file) {
        const form = new FormData();
        form.set('file', file);
        const uploaded = await uploadScreenshot(form);
        if (uploaded.error) return setError(uploaded.error);
        storagePath = uploaded.path ?? null;
      }

      const result = await capture(kind, raw, note, storagePath);
      if (result.error) return setError(result.error);
      setRaw('');
      setNote('');
      setFile(null);
      router.refresh();
    });

  return (
    <>
      <div className="dashBar">
        <h1>Captura</h1>
      </div>

      <p className="osCaptureHint">
        Cola o que tiveres — o link do perfil, a mensagem que recebeste, a página do produto. O
        sistema tira daí o que conseguir e pede-te só o que faltar.
      </p>

      <div className="osPanel osCapture">
        <div className="osKinds">
          {KINDS.map((k) => (
            <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>
              {k.label}
            </button>
          ))}
        </div>

        {kind === 'screenshot' ? (
          <label className="osField">
            <span>O print</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <small style={{ color: 'var(--tinta3)', fontSize: 13 }}>
              Vai para um espaço privado, nunca para a biblioteca do site. Serve para o Instagram,
              onde não há forma de ler as mensagens automaticamente.
            </small>
          </label>
        ) : null}

        <label className="osField">
          <span>{kind === 'screenshot' ? 'Alguma coisa a acrescentar' : 'Cola aqui'}</span>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={
              kind === 'screenshot'
                ? 'Opcional — o print já chega'
                : 'https://instagram.com/marca — ou a mensagem inteira, tal como ela veio'
            }
          />
        </label>

        <label className="osField">
          <span>Nota, se quiseres</span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="vi o anúncio deles ontem"
          />
        </label>

        <div className="osActs">
          <button
            className="btn"
            type="button"
            disabled={pending || (!raw.trim() && !file)}
            onClick={submit}
          >
            {pending ? 'A ler…' : 'Capturar'}
          </button>
        </div>

        {error ? <p className="osWarn" role="alert">{error}</p> : null}
      </div>

      {drafts.length ? (
        <section className="osSection">
          <h2>Por confirmar</h2>
          <p className="osNote">
            Nada vira marca sem tu dizeres que sim. Um link colado por engano não pode encher o CRM.
          </p>
          <div className="osQueue">
            {drafts.map((d) => <Draft key={d.id} draft={d} />)}
          </div>
        </section>
      ) : null}
    </>
  );
}

function Draft({ draft }: { draft: CaptureDraft }) {
  const [pending, start] = useTransition();
  const [gone, setGone] = useState(false);
  const [name, setName] = useState(draft.extracted?.brand_name ?? '');
  const [niche, setNiche] = useState(draft.extracted?.niche_id ?? '');
  const [error, setError] = useState('');
  const router = useRouter();

  if (gone) return null;
  const e = draft.extracted;

  return (
    <article className="osCard">
      <div className="osCardMain">
        <div className="osCardTop">
          <span className="osBrand">{label('captureKind', draft.kind)}</span>
          {typeof draft.confidence === 'number' ? (
            <span className="osTag" data-tone="mute">confiança {Math.round(draft.confidence * 100)}%</span>
          ) : null}
        </div>

        <h3>{e?.brand_name ?? 'Marca por identificar'}</h3>
        {e?.summary ? <p className="osWhy">{e.summary}</p> : null}

        <div className="osMeta">
          {e?.website ? <span>site <b>{e.website}</b></span> : null}
          {e?.instagram_handle ? <span>ig <b>@{e.instagram_handle}</b></span> : null}
          {e?.contact_email ? <span>email <b>{e.contact_email}</b></span> : null}
          {e?.product_name ? <span>produto <b>{e.product_name}</b></span> : null}
        </div>

        {e?.unknowns?.length ? (
          <p className="osRowSub">Não consegui apurar: {e.unknowns.join(', ')}.</p>
        ) : null}

        <div className="osInline" style={{ marginTop: 12 }}>
          <label className="osField">
            <span>Nome da marca</span>
            <input type="text" value={name} onChange={(ev) => setName(ev.target.value)} />
          </label>
          <label className="osField">
            <span>Categoria</span>
            <select value={niche} onChange={(ev) => setNiche(ev.target.value)}>
              <option value="">Por definir</option>
              {prospectableNiches().map((n) => (
                <option key={n.id} value={n.id}>{n.label}</option>
              ))}
            </select>
          </label>
        </div>

        {error ? <p className="osWarn" role="alert">{error}</p> : null}
      </div>

      <div className="osCardActs">
        <button
          className="btn"
          type="button"
          disabled={pending || !name.trim()}
          onClick={() =>
            start(async () => {
              setError('');
              const result = await confirmCapture(draft.id, name, niche);
              if (result.error) return setError(result.error);
              setGone(true);
              if (result.brandId) router.push(`/dashboard/brands/${result.brandId}`);
            })
          }
        >
          Criar
        </button>
        <button
          className="chip"
          type="button"
          disabled={pending}
          onClick={() => start(async () => { await dropCapture(draft.id); setGone(true); })}
        >
          Deitar fora
        </button>
      </div>
    </article>
  );
}
