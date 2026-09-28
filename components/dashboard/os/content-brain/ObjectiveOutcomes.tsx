import type { ObjectiveOutcomeRow } from '@/modules/content-brain/outcome-service';

/** Cada peça contra o objetivo com que foi planeada.
 *
 *  Não existe «post vencedor». Um Reel de atrair que trouxe alcance e nenhum
 *  comentário cumpriu a função; o mesmo número num post de reter não cumpriu.
 *  Esta secção existe para a comparação nunca ser feita num eixo só. */
export default function ObjectiveOutcomes({
  rows,
  unclassified,
}: {
  rows: ObjectiveOutcomeRow[];
  unclassified: number;
}) {
  if (rows.length === 0) {
    return (
      <section className="osSection">
        <h2>Contra o objetivo</h2>
        <p className="osEmpty">
          {unclassified > 0
            ? `${unclassified} ${unclassified === 1 ? 'publicação ainda não tem' : 'publicações ainda não têm'} objetivo registrado. Sem saber para que foi feita, não dá para dizer se cumpriu.`
            : 'Ainda não há publicações com objetivo registrado.'}
        </p>
      </section>
    );
  }

  return (
    <section className="osSection">
      <h2>Contra o objetivo</h2>
      <p className="osNote">
        Cada peça é lida contra o que ela ia fazer. Não existe um número que decida tudo.
      </p>
      <div className="osRows">
        {rows.map((r) => (
          <div className="osRow" key={r.mediaId}>
            <div>
              <span className="osRowName">{r.caption || 'Sem legenda'}</span>
              <p className="osRowSub">{r.because}</p>
              <div className="osMeta">
                <span className="osTag" data-tone="mute">{r.objectiveLabel}</span>
                {r.signals
                  .filter((s) => s.relativeToMedian !== null)
                  .slice(0, 3)
                  .map((s) => (
                    <span className="osTag" data-tone="mute" key={s.label}>
                      {s.label} {(s.relativeToMedian as number).toFixed(1)}×
                    </span>
                  ))}
              </div>
              {r.missing.length ? (
                <p className="osRowSub">Não medido: {r.missing.join(', ')}.</p>
              ) : null}
            </div>
            <div className="osRowSide">
              <span
                className="osTag"
                data-tone={r.outcome === 'met' ? 'won' : r.outcome === 'not_met' ? 'lost' : 'mute'}
              >
                {r.outcomeLabel}
              </span>
            </div>
          </div>
        ))}
      </div>
      {unclassified > 0 ? (
        <p className="osNote">
          {unclassified} {unclassified === 1 ? 'publicação ficou' : 'publicações ficaram'} de fora por não
          ter objetivo registrado.
        </p>
      ) : null}
    </section>
  );
}
