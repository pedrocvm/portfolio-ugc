'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { attachDocument, buildProposal, sendDocument } from '@/app/dashboard/carolos-actions';
import { formatDate } from '@/lib/time';
import { label } from '@/lib/labels';
import type { LinkedDocument } from '@/modules/documents/service';

/** Os documentos desta oportunidade.
 *
 *  Uma proposta nasce da oportunidade e do orçamento — escopo, valor e
 *  direitos já lá dentro. Reconstruí-la à mão é onde se escreve um valor que
 *  já não é o do orçamento, ou se esquece o período de uso que se negociou.
 *
 *  Marcá-la como enviada não é cosmético: congela o orçamento, move a etapa e
 *  faz arrancar o follow-up de proposta. */

const KIND_LABEL: Record<string, string> = {
  proposal: 'Proposta',
  contract: 'Contrato',
  usage: 'Autorização de uso',
};

export default function Documents({
  opportunityId, documents, candidates,
}: {
  opportunityId: string;
  documents: LinkedDocument[];
  candidates: LinkedDocument[];
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);

  return (
    <div className="osPanel">
      <h3>Documentos</h3>

      {documents.length ? (
        <div className="osRows">
          {documents.map((d) => (
            <div className="osRow" key={d.id}>
              <div>
                <span className="osRowName" style={{ fontSize: 17 }}>
                  {KIND_LABEL[d.kind] ?? d.kind} · {d.title}
                </span>
                <p className="osRowSub">
                  v{d.version}
                  {d.sentAt ? ` · enviado a ${formatDate(d.sentAt)}` : ' · por enviar'}
                </p>
              </div>
              <div className="osRowSide">
                <span className="osTag" data-tone={d.status === 'sent' ? 'ok' : 'mute'}>
                  {label('documentStatus', d.status)}
                </span>
                <Link className="chip" href="/dashboard/documents">Abrir</Link>
                {d.status === 'draft' ? (
                  <button
                    className="chip"
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        setError('');
                        const result = await sendDocument(d.id, opportunityId);
                        if (result.error) setError(result.error);
                      })
                    }
                  >
                    Marquei como enviado
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="osRowSub">Ainda não há documentos ligados a esta oportunidade.</p>
      )}

      <div className="osActs">
        <button
          className="btn"
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError('');
              setWarnings([]);
              const result = await buildProposal(opportunityId);
              if (result.error) return setError(result.error);
              setWarnings(result.warnings ?? []);
            })
          }
        >
          Preparar proposta a partir daqui
        </button>
      </div>

      {warnings.length ? (
        <div className="osWarn" data-tone="info">
          Proposta criada, mas repara:
          <ul className="osList">
            {warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        </div>
      ) : null}

      {candidates.length ? (
        <details className="osEvidence" style={{ marginTop: 16 }}>
          <summary>
            Documentos desta marca sem oportunidade ({candidates.length})
          </summary>
          <p className="osRowSub" style={{ marginTop: 8 }}>
            A importação só ligou os que batiam exatamente pelo nome. Estes precisam de uma
            confirmação — ligar o documento errado é pior do que não ligar nenhum.
          </p>
          <div className="osRows">
            {candidates.map((d) => (
              <div className="osRow" key={d.id}>
                <div>
                  <span className="osRowName" style={{ fontSize: 16 }}>
                    {KIND_LABEL[d.kind] ?? d.kind} · {d.title}
                  </span>
                  <p className="osRowSub">criado a {formatDate(d.createdAt)}</p>
                </div>
                <div className="osRowSide">
                  <button
                    className="chip"
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        setError('');
                        const result = await attachDocument(d.id, opportunityId);
                        if (result.error) setError(result.error);
                      })
                    }
                  >
                    É desta oportunidade
                  </button>
                </div>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {error ? <p className="osWarn" role="alert">{error}</p> : null}
    </div>
  );
}
