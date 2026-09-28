import type { CommunityView } from '@/modules/content-brain/community-service';

/** Qualidade da comunidade, não quantidade de comentários.
 *
 *  Quarenta «arrasou» e quatro «isso aconteceu comigo» somam quarenta e
 *  quatro, e são coisas diferentes. Esta secção mostra a diferença — e diz em
 *  voz alta quando a amostra é pequena demais para dizer o que quer que seja.
 *
 *  A leitura é sempre do conjunto. Nenhuma linha aqui afirma o que uma pessoa
 *  quis dizer. */
export default function Community({ data }: { data: CommunityView }) {
  if (data.total === 0) {
    return (
      <section className="osSection">
        <h2>A comunidade</h2>
        <p className="osEmpty">Ainda não há comentários nesta janela.</p>
      </section>
    );
  }

  const max = Math.max(...data.breakdown.map((b) => b.count), 1);

  return (
    <section className="osSection">
      <h2>A comunidade</h2>
      <p className="cbCommunityReading">{data.reading}</p>

      <div className="osBars">
        {data.breakdown.map((b) => (
          <div className="osBar" key={b.intent}>
            <span>{b.label}</span>
            <i style={{ width: `${(b.count / max) * 100}%` }} />
            <b>{b.count}</b>
          </div>
        ))}
      </div>

      {data.unclassified > 0 ? (
        <p className="osNote">
          {data.unclassified} {data.unclassified === 1 ? 'comentário ainda sem leitura' : 'comentários ainda sem leitura'} de
          intenção. Aparecem no total, não na conta acima.
        </p>
      ) : null}

      <p className="osNote">
        Isto é leitura do conjunto, e é probabilística. Serve para comparar peças, não para dizer o
        que uma pessoa quis dizer.
      </p>
    </section>
  );
}
