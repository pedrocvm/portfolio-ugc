'use client';

import Spinner from '@/components/dashboard/Spinner';

/** O que foi procurado, e o que ficou pelo caminho.
 *
 *  Uma lista de seis resultados sem explicação parece uma busca fraca. Com o
 *  que foi descartado à vista, lê-se como uma busca exigente — e ela consegue
 *  entender se o problema foi o termo, o país, ou não haver mesmo nada. */

export type ManualRun = {
  id: string;
  raw_query: string | null;
  countries: string[] | null;
  search_terms: string[] | null;
  discovered: number;
  rejected_irrelevant: number;
  rejected_country: number;
  rejected_known: number;
  status: string;
};

export default function ResultsBar({
  run,
  count,
  pending,
  onSaveAll,
  onClear,
}: {
  run: ManualRun;
  count: number;
  pending: boolean;
  onSaveAll: () => void;
  onClear: () => void;
}) {
  const termos = run.search_terms ?? [];
  const pais = run.countries?.[0];
  const fora = run.rejected_irrelevant + run.rejected_country;

  return (
    <section className="resBar" aria-label="Resultados da procura">
      <div className="resTop">
        <h2>
          {run.raw_query ? <>Resultados para «{run.raw_query}»</> : 'Resultados'}
          {pais ? <span className="resPais">{pais}</span> : null}
        </h2>
        <span className="resCount">
          {count} {count === 1 ? 'marca' : 'marcas'}
        </span>

        <div className="resActs">
          <button type="button" className="osPageBtn" disabled={pending || count === 0} onClick={onSaveAll}>
            {pending ? <Spinner label="Salvando" /> : null}
            Salvar todas
          </button>
          <button type="button" className="osPageBtn" disabled={pending} onClick={onClear}>
            Limpar busca
          </button>
        </div>
      </div>

      {fora > 0 ? (
        <p className="resFora">
          {/* Dizer quantas saíram, e porquê, é o que impede isto de parecer uma
              busca fraca quando na verdade foi exigente. */}
          {run.rejected_irrelevant > 0 ? (
            <>
              {run.rejected_irrelevant} não {run.rejected_irrelevant === 1 ? 'era' : 'eram'} o que pediu
            </>
          ) : null}
          {run.rejected_irrelevant > 0 && run.rejected_country > 0 ? ' · ' : ''}
          {run.rejected_country > 0 ? <>{run.rejected_country} fora de {pais}</> : null}
          {run.rejected_known > 0 ? <> · {run.rejected_known} que já conhecia</> : null}
        </p>
      ) : null}

      {termos.length ? (
        <details className="resTermos">
          <summary>Ver estratégia de busca</summary>
          <div>
            <p>O que o motor procurou, a partir do que escreveu:</p>
            <div className="resChips">
              {termos.map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
            <p className="resNums">
              {run.discovered} encontradas · {fora} descartadas · {count} mostradas
            </p>
          </div>
        </details>
      ) : null}
    </section>
  );
}
