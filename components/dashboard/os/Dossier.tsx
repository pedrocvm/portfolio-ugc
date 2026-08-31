'use client';

import { useState, useTransition } from 'react';
import { researchBrand } from '@/app/dashboard/carolos-actions';
import { formatDate } from '@/lib/time';
import type { BrandDossier } from '@/modules/ai/schemas';

/** Dossiê de marca: uma leitura comercial de uma página, para decidir se vale
 *  o tempo dela.
 *
 *  Cada afirmação não óbvia traz a fonte. O que o sistema não conseguiu
 *  verificar aparece como desconhecido, e é de propósito — «não consegui
 *  confirmar que fazem anúncios» é útil; «não fazem anúncios» sem prova
 *  levava-a a descartar uma marca boa. */
export default function Dossier({
  brandId, dossier, generatedAt, aiEnabled,
}: {
  brandId: string;
  dossier: BrandDossier | null;
  generatedAt: string | null;
  aiEnabled: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  return (
    <div className="osPanel">
      <h3>Dossiê</h3>

      {!aiEnabled ? (
        <p className="osNote">
          Ligue a camada de IA em Definições para o sistema resumir o que já sabe
          sobre esta marca numa leitura comercial.
        </p>
      ) : (
        <>
          <p className="osNote">
            Sintetiza o que o sistema observou — conversas, capturas, produtos, contatos. Não
            navega a web: o que não estiver no registro sai como desconhecido, não como afirmação.
          </p>
          <div className="osActs">
            <button
              className="btn"
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setError('');
                  setMessage('');
                  const result = await researchBrand(brandId);
                  if (result.error) return setError(result.error);
                  setMessage(`Dossiê atualizado. Fit recalculado: ${result.fitScore}.`);
                })
              }
            >
              {pending ? 'A ler o que sabemos…' : dossier ? 'Voltar a analisar' : 'Analisar a marca'}
            </button>
            {generatedAt ? <span className="osRowSub">último a {formatDate(generatedAt)}</span> : null}
          </div>
        </>
      )}

      {error ? <p className="osWarn" role="alert">{error}</p> : null}
      {message ? <p className="osWarn" data-tone="ok">{message}</p> : null}

      {dossier ? (
        <>
          <div className="osRows" style={{ marginTop: 16 }}>
            <Block label="O que vendem" text={dossier.what_they_sell} />
            <Block label="Porque encaixa" text={dossier.why_it_fits} />
            <Block label="Maturidade em paid e creators" text={dossier.paid_creator_maturity} />
            {dossier.best_product_to_pitch ? (
              <Block label="Produto a propor" text={dossier.best_product_to_pitch} />
            ) : null}
            <Block label="Sinal comercial" text={dossier.commercial_signal} />
            {dossier.contact_path ? <Block label="Caminho de contato" text={dossier.contact_path} /> : null}
          </div>

          {dossier.creative_opportunities.length ? (
            <>
              <p className="osRowSub" style={{ marginTop: 16 }}>Oportunidade criativa</p>
              <ul className="osList">
                {dossier.creative_opportunities.map((o) => <li key={o}>{o}</li>)}
              </ul>
            </>
          ) : null}

          {dossier.risks.length ? (
            <>
              <p className="osRowSub" style={{ marginTop: 16 }}>Riscos</p>
              <ul className="osList" data-tone="bad">
                {dossier.risks.map((r) => <li key={r}>{r}</li>)}
              </ul>
            </>
          ) : null}

          {dossier.unknowns.length ? (
            <>
              <p className="osRowSub" style={{ marginTop: 16 }}>Não foi possível verificar</p>
              <ul className="osList">
                {dossier.unknowns.map((u) => <li key={u}>{u}</li>)}
              </ul>
            </>
          ) : null}

          {dossier.evidence.length ? (
            <details className="osEvidence" style={{ marginTop: 16 }}>
              <summary>De onde saiu cada afirmação ({dossier.evidence.length})</summary>
              <ul className="osList">
                {dossier.evidence.map((e, i) => (
                  <li key={`${i}-${e.claim.slice(0, 16)}`}>
                    {e.claim} — <em>{e.source}</em>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function Block({ label, text }: { label: string; text: string }) {
  if (!text) return null;
  return (
    <div className="osRow">
      <div>
        <span className="osRowName" style={{ fontSize: 16 }}>{label}</span>
        <p className="osRowSub">{text}</p>
      </div>
    </div>
  );
}
