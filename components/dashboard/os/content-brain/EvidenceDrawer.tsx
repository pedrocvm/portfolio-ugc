'use client';

import { useState, useTransition } from 'react';
import { loadEvidence } from '@/app/dashboard/content-audit-actions';
import type { Evidence } from '@/modules/content-brain/audit';
import type { EvidencePack } from '@/modules/content-brain/audit-service';
import InstagramPeek from './InstagramPeek';

/** «Ver evidências».
 *
 *  Existe para nenhuma frase desta tela ser um ato de fé. Abre e mostra os
 *  conteúdos, os aprendizados e os testes que sustentam a conclusão — e, se
 *  não houver nada rastreável, diz isso em vez de mostrar uma gaveta vazia.
 *
 *  Carrega só ao abrir: uma auditoria com seis conclusões não vai buscar seis
 *  listas de peças que ninguém pediu. */

const dia = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Europe/Lisbon' });

const vazia = (e: Evidence) =>
  !e.mediaIds.length && !e.learningIds.length && !e.experimentIds.length && !e.sequenceIds.length;

const plural = (n: number, um: string, muitos: string) => `${n} ${n === 1 ? um : muitos}`;

/** «4 conteúdos · 1 teste». Nunca um separador pendurado no fim — foi o que a
 *  primeira captura da tela mostrou. */
const contar = (e: Evidence): string =>
  [
    e.mediaIds.length ? plural(e.mediaIds.length, 'conteúdo', 'conteúdos') : '',
    e.sequenceIds.length ? plural(e.sequenceIds.length, 'sequência', 'sequências') : '',
    e.experimentIds.length ? plural(e.experimentIds.length, 'teste', 'testes') : '',
    e.learningIds.length ? plural(e.learningIds.length, 'aprendizado', 'aprendizados') : '',
  ]
    .filter(Boolean)
    .join(' · ');

export default function EvidenceDrawer({
  statement,
  because,
  sample,
  evidence,
  initialPack = null,
}: {
  statement: string;
  because?: string;
  sample?: string;
  evidence: Evidence;
  /** Prova já resolvida. Na aplicação vem sempre vazia — a gaveta busca ao
   *  abrir, para não carregar seis listas que ninguém pediu. A bancada
   *  preenche-a porque lá não há sessão: a ação de servidor redirecionaria
   *  para o login e a tela aberta não teria como ser mostrada a ninguém. */
  initialPack?: EvidencePack | null;
}) {
  const [pack, setPack] = useState<EvidencePack | null>(initialPack);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (vazia(evidence)) {
    return (
      <p className="osNote auNoEvidence">
        Esta leitura vem da comparação com o período anterior, não de peças específicas.
      </p>
    );
  }

  const abrir = (e: React.SyntheticEvent<HTMLDetailsElement>) => {
    if (!e.currentTarget.open || pack || pending) return;
    start(async () => {
      const r = await loadEvidence({ statement, because, sample, evidence });
      if ('error' in r) setErro(r.error);
      else setPack(r.pack);
    });
  };

  return (
    <details className="auEvidence" onToggle={abrir}>
      <summary>
        Ver evidências
        <span className="osNote"> ({contar(evidence)})</span>
      </summary>

      {pending && !pack ? <p className="osNote">Abrindo…</p> : null}
      {erro ? <p className="osWarn">{erro}</p> : null}

      {pack ? (
        <>
          {pack.pieces.length ? (
            <ul className="auEvidenceList">
              {pack.pieces.map((p) => (
                <li key={p.mediaId}>
                  <span>{p.title}</span>
                  <span className="osNote">
                    {dia(p.publishedAt)}
                    {p.mediaProductType === 'REELS' ? ' · Reel' : p.mediaProductType === 'STORY' ? ' · Story' : ''}
                  </span>
                  {p.permalink ? <InstagramPeek permalink={p.permalink} label="Ver" /> : null}
                </li>
              ))}
            </ul>
          ) : null}

          {pack.learnings.length ? (
            <ul className="auEvidenceList">
              {pack.learnings.map((l) => (
                <li key={l.id}>
                  <span>{l.statement}</span>
                  <span className="osNote">
                    {l.sampleSize} {l.sampleSize === 1 ? 'conteúdo' : 'conteúdos'}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {pack.experiments.length ? (
            <ul className="auEvidenceList">
              {pack.experiments.map((x) => (
                <li key={x.id}>
                  <span>{x.label}</span>
                  <span className="osNote">{x.because}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {pack.sequences.length ? (
            <ul className="auEvidenceList">
              {pack.sequences.map((q) => (
                <li key={q.id}>
                  <span>{q.label}</span>
                  <span className="osNote">
                    {dia(q.startedAt)} · {q.storyCount} {q.storyCount === 1 ? 'frame' : 'frames'}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {!pack.pieces.length && !pack.learnings.length && !pack.experiments.length && !pack.sequences.length ? (
            <p className="osNote">As peças que sustentavam isto já não estão no histórico.</p>
          ) : null}
        </>
      ) : null}
    </details>
  );
}
