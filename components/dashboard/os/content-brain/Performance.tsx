import Link from 'next/link';
import { SNAPSHOT_WINDOW, type SnapshotKind } from '@/modules/content-brain/metrics';
import { LADDER_LABEL, LADDER_PHRASING, type LadderState } from '@/modules/content-brain/learning';
import HelpNote from './HelpNote';

/** Publicado e desempenho.
 *
 *  Responde a «como os conteúdos estão cumprindo a função», não a «quantos
 *  números temos». Doze KPIs por linha seria um dashboard de vaidade.
 *
 *  Duas regras visíveis na tela:
 *  - métrica indisponível diz «indisponível», nunca zero;
 *  - a leitura é relativa à mediana dela, e quando não há amostra diz isso. */

export type PieceView = {
  mediaId: string;
  permalink: string | null;
  caption: string;
  publishedAt: string;
  productType: string;
  trialStatus: string;
  storyTitle: string | null;
  pillarLabel: string | null;
  readings: { metric: string; reading: string; comparable: boolean }[];
  snapshots: { kind: SnapshotKind; metrics: Record<string, number | null> }[];
  latestKind: SnapshotKind | null;
};

export type LearningView = {
  id: string;
  statement: string;
  ladderState: LadderState;
  confidence: string;
  sampleSize: number;
};

const dia = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

export default function Performance({
  pieces,
  learnings,
  lastSyncAt,
}: {
  pieces: PieceView[];
  learnings: LearningView[];
  lastSyncAt: string | null;
}) {
  if (pieces.length === 0) {
    return (
      <section className="osSection">
        <h2>Ainda não vi nenhuma publicação.</h2>
        <p className="osNote">
          {lastSyncAt
            ? 'Assim que você publicar, eu detecto e começo a acompanhar. Você não precisa copiar métrica nenhuma.'
            : 'O Instagram ainda não está ligado. Sem isso não consigo acompanhar o que você publica.'}
        </p>
      </section>
    );
  }

  const comSinal = pieces.filter((p) => p.readings.some((r) => r.comparable && /[2-9],\d×|1,[5-9]×/.test(r.reading)));

  return (
    <>
      <section className="osSection">
        <h2>Publicado</h2>
        <p className="osNote">
          {pieces.length} {pieces.length === 1 ? 'peça' : 'peças'}
          {comSinal.length ? ` · ${comSinal.length} acima da sua mediana` : ''}
          {lastSyncAt ? ` · última leitura ${dia(lastSyncAt)}` : ''}
        </p>

        <div className="osRows">
          {pieces.map((p) => (
            <div className="osRow cbPiece" key={p.mediaId}>
              <div>
                <span className="osRowName">{p.storyTitle ?? p.caption.slice(0, 70) ?? 'Sem legenda'}</span>
                <p className="osRowSub">
                  {dia(p.publishedAt)}
                  {p.pillarLabel ? ` · ${p.pillarLabel}` : ''}
                  {p.trialStatus === 'yes' ? ' · Reel Test' : ''}
                </p>
                {p.readings.length ? (
                  <div className="cbReadings">
                    {p.readings.map((r) => (
                      <span key={r.metric} className="cbReading" data-weak={!r.comparable || undefined}>
                        {r.reading}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="osNote">Ainda não medi esta peça.</p>
                )}
                {p.snapshots.length > 1 ? (
                  <p className="cbTimeline" aria-label="Janelas medidas">
                    {p.snapshots.map((s) => (
                      <span key={s.kind}>{SNAPSHOT_WINDOW[s.kind].label}</span>
                    ))}
                  </p>
                ) : null}
              </div>
              <div className="osRowSide">
                {!p.storyTitle ? <span className="osTag" data-tone="hot">Sem história</span> : null}
                {p.permalink ? (
                  <Link className="chip" href={p.permalink} target="_blank" rel="noreferrer">
                    Ver
                  </Link>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="osSection">
        <h2>O que os números ensinam</h2>
        <HelpNote question="O que acontece depois de publicar?">
          <p>
            Você não precisa abrir os Insights. Eu detecto a publicação e meço sozinho em janelas
            fixas — 1 hora, 6 horas, 24 horas, 72 horas, 7 dias e 30 dias — sempre comparando com a
            sua própria mediana.
          </p>
          <p>
            O que aparece sobe um degrau de cada vez: sinal, hipótese, aprendizado. Um vídeo bom não
            vira regra; só o que se repete o suficiente passa a orientar decisão.
          </p>
        </HelpNote>
        {learnings.length === 0 ? (
          <p className="osEmpty">
            Ainda não temos repetição suficiente para chamar nada de padrão.
          </p>
        ) : (
          <ul className="cbLadder">
            {learnings.map((l) => (
              <li key={l.id} data-state={l.ladderState}>
                <span className="cbLadderState">{LADDER_LABEL[l.ladderState]}</span>
                <p>{l.statement}</p>
                <span className="osNote">
                  {LADDER_PHRASING[l.ladderState]} {l.sampleSize} {l.sampleSize === 1 ? 'peça' : 'peças'} · confiança{' '}
                  {l.confidence === 'high' ? 'alta' : l.confidence === 'medium' ? 'média' : 'baixa'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
