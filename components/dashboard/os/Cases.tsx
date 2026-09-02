'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { casePermission, publishCase, saveCase, unpublishCase } from '@/app/dashboard/carolos-actions';
import { formatDate } from '@/lib/time';
import type { CaseRow } from '@/modules/cases/service';

/** Cases e ponte para o portfólio.
 *
 *  A verificação de permissão é feita no servidor. O botão desativado aqui é
 *  cortesia, não segurança: nada sai para o site sem a marca ter autorizado
 *  por escrito, e é o servidor que o garante. */

const PERMISSION_LABEL: Record<string, string> = {
  unknown: 'ainda não perguntei',
  requested: 'pedida',
  granted: 'autorizada',
  denied: 'recusada',
};

export default function Cases({
  cases, media, niches,
}: {
  cases: CaseRow[];
  media: { id: string; title: string; url: string; kind: string; niche: string }[];
  niches: string[];
}) {
  const published = cases.filter((c) => c.visibility === 'public');
  const drafts = cases.filter((c) => c.visibility !== 'public');

  return (
    <>
      <div className="dashBar">
        <h1>Cases</h1>
        <span className="dashState">{published.length} no site</span>
      </div>

      <p className="osNote">
        Um trabalho aprovado só vira prova comercial quando tem resultado, permissão e um lugar
        onde se veja. É daqui que sai a justificação para subir o preço da próxima proposta.
      </p>

      {drafts.length ? (
        <section className="osSection">
          <h2>Rascunhos</h2>
          {drafts.map((c) => <CaseCard key={c.id} study={c} media={media} niches={niches} />)}
        </section>
      ) : (
        <p className="osEmpty">
          Ainda não há cases. Um rascunho nasce a partir de uma colaboração aprovada, em Produção.
        </p>
      )}

      {published.length ? (
        <section className="osSection">
          <h2>No portfólio</h2>
          {published.map((c) => <CaseCard key={c.id} study={c} media={media} niches={niches} />)}
        </section>
      ) : null}
    </>
  );
}

function CaseCard({
  study, media, niches,
}: {
  study: CaseRow;
  media: { id: string; title: string; url: string; kind: string; niche: string }[];
  niches: string[];
}) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(study.title);
  const [challenge, setChallenge] = useState(study.challenge);
  const [hypothesis, setHypothesis] = useState(study.hypothesis);
  const [result, setResult] = useState(study.result);
  const [picked, setPicked] = useState<string[]>([]);
  const [niche, setNiche] = useState(niches[0] ?? '');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  return (
    <article className="osPanel">
      <div className="osCardTop">
        <span className="osBrand">{study.brandName}</span>
        <span className="osTag" data-tone={study.permission === 'granted' ? 'ok' : study.permission === 'denied' ? 'bad' : 'hot'}>
          permissão {PERMISSION_LABEL[study.permission]}
        </span>
        {study.visibility === 'public' ? (
          <span className="osTag" data-tone="ok">
            no site desde {study.publishedAt ? formatDate(study.publishedAt) : '—'}
          </span>
        ) : null}
      </div>

      <h3>{study.title}</h3>

      {study.missingMetrics.length ? (
        <p className="osRowSub">Falta para ficar completo: {study.missingMetrics.join(', ')}.</p>
      ) : null}

      {study.capabilityTags.length ? (
        <div className="osMeta">
          {study.capabilityTags.map((t) => <span key={t} className="osTag" data-tone="mute">{t}</span>)}
        </div>
      ) : null}

      <div className="osActs">
        <button className="chip" type="button" onClick={() => setOpen((v) => !v)}>
          {open ? 'Fechar' : 'Editar e publicar'}
        </button>
        {study.collaborationId ? (
          <Link className="chip" href={`/dashboard/production/${study.collaborationId}`}>Ver a produção</Link>
        ) : null}
      </div>

      {open ? (
        <>
          <label className="osField" style={{ marginTop: 14 }}>
            <span>Título</span>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="osField">
            <span>Desafio</span>
            <textarea value={challenge} onChange={(e) => setChallenge(e.target.value)} rows={3} />
          </label>
          <label className="osField">
            <span>Hipótese</span>
            <textarea value={hypothesis} onChange={(e) => setHypothesis(e.target.value)} rows={3} />
          </label>
          <label className="osField">
            <span>Resultado</span>
            <textarea value={result} onChange={(e) => setResult(e.target.value)} rows={3} />
          </label>

          <div className="osActs">
            <button
              className="btn"
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await saveCase(study.id, { title, challenge, hypothesis, result });
                  setMessage('Salvo.');
                })
              }
            >
              salvar
            </button>
          </div>

          <label className="osField" style={{ marginTop: 18 }}>
            <span>Permissão da marca</span>
            <select
              value={study.permission}
              onChange={(e) => start(() => casePermission(study.id, e.target.value).then(() => undefined))}
            >
              <option value="unknown">Ainda não perguntei</option>
              <option value="requested">Pedida</option>
              <option value="granted">Autorizada por escrito</option>
              <option value="denied">Recusada</option>
            </select>
          </label>

          {study.visibility === 'public' ? (
            <div className="osActs">
              <button
                className="chip"
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    await unpublishCase(study.id);
                    setMessage('Retirado do site. Nada foi apagado.');
                  })
                }
              >
                Retirar do site
              </button>
            </div>
          ) : (
            <>
              <p className="osRowSub" style={{ marginTop: 16 }}>
                Escolha os arquivos da biblioteca que vão para o site
              </p>
              <div className="osKinds">
                {media.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={picked.includes(m.id)}
                    onClick={() =>
                      setPicked((v) => (v.includes(m.id) ? v.filter((x) => x !== m.id) : [...v, m.id]))
                    }
                  >
                    {m.title || m.url.split('/').pop()?.slice(0, 22)}
                  </button>
                ))}
              </div>

              <label className="osField" style={{ marginTop: 12 }}>
                <span>Nicho no site</span>
                <select value={niche} onChange={(e) => setNiche(e.target.value)}>
                  {niches.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>

              <div className="osActs">
                <button
                  className="btn"
                  type="button"
                  disabled={pending || study.permission !== 'granted' || !picked.length}
                  onClick={() =>
                    start(async () => {
                      setError('');
                      const out = await publishCase(study.id, picked, niche);
                      if (out.error) return setError(out.error);
                      setMessage('Publicado. Já aparece no portfólio.');
                    })
                  }
                >
                  Publicar no portfólio
                </button>
                {study.permission !== 'granted' ? (
                  <span className="osRowSub">
                    Sem permissão registada, nada sai para o site.
                  </span>
                ) : null}
              </div>
            </>
          )}

          {error ? <p className="osWarn" role="alert">{error}</p> : null}
          {message ? <p className="osWarn" data-tone="ok">{message}</p> : null}
        </>
      ) : null}
    </article>
  );
}
