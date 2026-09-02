'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { capture, confirmCapture, dropCapture, uploadScreenshot } from '@/app/dashboard/carolos-actions';
import { prospectableNiches } from '@/modules/brands/niches';
import { readCapture } from '@/modules/capture/read';
import type { CaptureDraft } from '@/modules/capture/service';

/** Captura rápida.
 *
 *  O objetivo é dez segundos: colar e confirmar. Não há campos obrigatórios,
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

export default function Capture({
  drafts,
  focusLabels,
}: {
  drafts: CaptureDraft[];
  focusLabels: string[];
}) {
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

      // O print sobe primeiro, para o bucket privado; a captura salva só o
      // caminho. O arquivo nunca passa por uma tabela.
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
        Cole o que tiver — o link do perfil, a mensagem que recebeste, a página do produto. O
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
          <span>{kind === 'screenshot' ? 'Alguma coisa a acrescentar' : 'Cole aqui'}</span>
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
          <span>Nota, se quiser</span>
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
            Nada vira marca sem o seu sim. Um link colado por engano não pode encher o CRM.
          </p>
          <div className="osQueue">
            {drafts.map((d) => (
              <Draft key={d.id} draft={d} focusLabels={focusLabels} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

function Draft({ draft, focusLabels }: { draft: CaptureDraft; focusLabels: string[] }) {
  const [pending, start] = useTransition();
  const [gone, setGone] = useState(false);
  const [name, setName] = useState(draft.extracted?.brand_name ?? '');
  const [niche, setNiche] = useState(draft.extracted?.niche_id ?? '');
  const [error, setError] = useState('');
  const [detalhe, setDetalhe] = useState(false);
  const router = useRouter();

  if (gone) return null;
  const e = draft.extracted;

  const leitura = readCapture(
    {
      brandName: e?.brand_name ?? null,
      website: e?.website ?? null,
      instagramHandle: e?.instagram_handle ?? null,
      contactEmail: e?.contact_email ?? null,
      contactName: e?.contact_name ?? null,
      productName: e?.product_name ?? null,
      nicheId: e?.niche_id ?? null,
      summary: e?.summary ?? '',
      asks: e?.asks ?? [],
    },
    focusLabels,
  );

  // Ela escreveu um nome que o extractor não tinha: o bloqueio deixa de existir.
  const bloqueios = name.trim() ? [] : leitura.blocking;

  return (
    <article className="capCard" data-fit={leitura.fit.verdict}>
      <h3>{name.trim() || leitura.title}</h3>
      {leitura.what ? <p className="capWhat">{leitura.what}</p> : null}

      {/* A resposta à pergunta que ela tem quando cola um link. */}
      <p className="capFit">{leitura.fit.line}</p>

      {leitura.known.length ? (
        <dl className="capKnown">
          {leitura.known.map((k) => (
            <div key={k.label}>
              <dt>{k.label}</dt>
              <dd>{k.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <p className="capNext">{leitura.next}</p>

      {bloqueios.map((b) => (
        <p className="osWarn" data-tone="info" key={b}>
          {b}
        </p>
      ))}

      {error ? (
        <p className="osWarn" role="alert">
          {error}
        </p>
      ) : null}

      <div className="capActs">
        <button
          className="osGo"
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
          Criar a marca
        </button>

        {/* O nome e a categoria deixaram de estar sempre à vista. Estavam
            preenchidos e certos na maior parte das vezes, e dois campos abertos
            fazem uma tela parecer um formulário por preencher. */}
        <button className="osPageBtn" type="button" onClick={() => setDetalhe((v) => !v)}>
          {detalhe ? 'Fechar' : 'Corrigir'}
        </button>

        <button
          className="focusSkip"
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await dropCapture(draft.id);
              setGone(true);
            })
          }
        >
          Deitar fora
        </button>
      </div>

      {detalhe || bloqueios.length ? (
        <div className="capFix">
          <label className="osField">
            <span>Nome da marca</span>
            <input
              type="text"
              value={name}
              autoFocus={bloqueios.length > 0}
              onChange={(ev) => setName(ev.target.value)}
            />
          </label>
          <label className="osField">
            <span>Categoria</span>
            <select value={niche} onChange={(ev) => setNiche(ev.target.value)}>
              <option value="">Por definir</option>
              {prospectableNiches().map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
    </article>
  );
}
