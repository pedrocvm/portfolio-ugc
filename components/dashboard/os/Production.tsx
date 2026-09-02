import Link from 'next/link';
import { formatDate, relativeDays } from '@/lib/time';
import { STATUS_LABEL, type CollaborationRow } from '@/modules/production/domain';

/** Produção. A coluna que interessa é a dos bloqueios: gravar antes de os
 *  termos estarem fechados é como se descobre o problema depois de a câmara
 *  já ter desligado. */
export default function Production({ rows }: { rows: CollaborationRow[] }) {
  const blocked = rows.filter((c) => c.gateBlockers.length);
  const ready = rows.filter((c) => !c.gateBlockers.length);

  return (
    <>
      <div className="dashBar">
        <h1>Produção</h1>
        <span className="dashState">{rows.length} em curso</span>
      </div>

      <div className="osStats">
        <div className="osStat">
          <b>{ready.length}</b>
          <span>prontas ou a andar</span>
        </div>
        <div className="osStat">
          <b>{blocked.length}</b>
          <span>com algo por resolver</span>
        </div>
        <div className="osStat">
          <b>{rows.filter((c) => c.deadlineAt && new Date(c.deadlineAt) < new Date()).length}</b>
          <span>fora de prazo</span>
        </div>
      </div>

      {blocked.length ? (
        <section className="osSection">
          <h2>Por destravar</h2>
          <p className="osNote">Falta fechar isto antes de gravar.</p>
          <div className="osRows">
            {blocked.map((c) => (
              <Link className="osRow" key={c.id} href={`/dashboard/production/${c.id}`}>
                <div>
                  <span className="osRowName">{c.brandName} · {c.title}</span>
                  <p className="osRowSub">{c.gateBlockers.join(' ')}</p>
                </div>
                <div className="osRowSide">
                  <span className="osTag" data-tone="hot">{STATUS_LABEL[c.status]}</span>
                  {c.deadlineAt ? <span>{relativeDays(c.deadlineAt)}</span> : null}
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="osSection">
        <h2>Andando</h2>
        {ready.length ? (
          <div className="osRows">
            {ready.map((c) => (
              <Link className="osRow" key={c.id} href={`/dashboard/production/${c.id}`}>
                <div>
                  <span className="osRowName">{c.brandName} · {c.title}</span>
                  <p className="osRowSub">
                    {c.compensationModel}
                    {c.deadlineAt ? ` · entrega ${formatDate(c.deadlineAt)}` : ' · sem prazo'}
                  </p>
                </div>
                <div className="osRowSide">
                  <span className="osTag" data-tone={c.status === 'approved' ? 'won' : 'mute'}>
                    {STATUS_LABEL[c.status]}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="osEmpty">
            Nenhuma produção aberta. Uma oportunidade fechada abre a produção a partir da página
            dela.
          </p>
        )}
      </section>
    </>
  );
}
