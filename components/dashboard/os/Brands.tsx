import Link from 'next/link';
import { formatMoney } from '@/lib/money';
import { relativeDays } from '@/lib/time';
import { nicheById } from '@/modules/brands/niches';
import type { BrandRow } from '@/modules/brands/service';

/** A lista de marcas deixou de ser um CRUD: é a leitura da relação. Cada linha
 *  diz onde está a marca, quanto já pagou e quando foi a última vez. */

export type BrandListRow = BrandRow & {
  openOpportunities: number;
  totalCashCents: number;
  nextAction: string;
};

export default function Brands({ rows }: { rows: BrandListRow[] }) {
  const active = rows.filter((b) => b.status === 'active');
  const nurture = rows.filter((b) => b.status === 'nurture');
  const archived = rows.filter((b) => b.status === 'archived' || b.status === 'blocked');

  const group = (list: BrandListRow[]) => (
    <div className="osRows">
      {list.map((b) => {
        const niche = nicheById(b.categoryPrimary);
        return (
          <Link className="osRow" key={b.id} href={`/dashboard/brands/${b.id}`}>
            <div>
              <span className="osRowName">{b.name}</span>
              <p className="osRowSub">
                {b.nextAction || (b.openOpportunities ? 'sem próxima ação' : 'sem oportunidade aberta')}
              </p>
            </div>
            <div className="osRowSide">
              {niche.tier === 'EXCLUDED' ? (
                <span className="osTag" data-tone="mute">fora da estratégia</span>
              ) : b.categoryPrimary ? (
                <span className="osTag" data-tone="mute">{niche.label}</span>
              ) : null}
              {b.totalCashCents > 0 ? <b>{formatMoney(b.totalCashCents)}</b> : null}
              {typeof b.fitScore === 'number' ? (
                <span className="osTag" data-tone={b.fitBand === 'A' ? 'ok' : b.fitBand === 'B' ? 'hot' : 'mute'}>
                  fit {b.fitScore}
                </span>
              ) : null}
              {b.lastActivityAt ? <span>{relativeDays(b.lastActivityAt)}</span> : null}
            </div>
          </Link>
        );
      })}
    </div>
  );

  return (
    <>
      <div className="dashBar">
        <h1>Marcas</h1>
        <span className="dashState">{active.length} activas</span>
        <Link className="chip" href="/dashboard/capture">Adicionar por captura</Link>
      </div>

      <p className="osNote">
        As marcas aparecem sozinhas a partir de uma conversa ou de uma captura. Não há formulário
        obrigatório — se precisares de acrescentar uma à mão, cola o link em Captura.
      </p>

      <section className="osSection">
        {active.length ? group(active) : <p className="osEmpty">Ainda não há marcas activas.</p>}
      </section>

      {nurture.length ? (
        <section className="osSection">
          <h2>Nurture</h2>
          {group(nurture)}
        </section>
      ) : null}

      {archived.length ? (
        <section className="osSection">
          <h2>Arquivadas</h2>
          <p className="osNote">Ficam aqui com o histórico inteiro. Nada foi apagado.</p>
          {group(archived)}
        </section>
      ) : null}
    </>
  );
}
