'use client';

import Link from 'next/link';
import type { ContentIdeaRow } from '@/modules/creator/plan-service';
import type { LatestPerformance, LearningRow } from '@/modules/creator/content-os-service';
import InsightsDrop from './InsightsDrop';

/** Publicado: conteúdo, resultado, aprendizado. Três coisas por peça, e no
 *  máximo três aprendizados no topo — não um painel de vinte e cinco métricas. */
export default function Published({
  pieces,
  performance,
  learnings,
}: {
  pieces: ContentIdeaRow[];
  performance: Record<string, LatestPerformance>;
  learnings: LearningRow[];
}) {
  const confianca: Record<string, string> = { low: 'poucas peças', medium: 'amostra razoável', high: 'amostra boa' };

  return (
    <>
      <section className="osSection">
        <h2>O que estamos aprendendo</h2>
        {learnings.length ? (
          <div className="osRows">
            {learnings.map((l) => (
              <div className="osRow" key={l.id}>
                <div>
                  <span className="osRowName" style={{ fontSize: 17 }}>{l.statement}</span>
                  <p className="osRowSub">
                    {l.sampleSize} peças · {confianca[l.confidence] ?? l.confidence} · números reais dela
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="osRowSub">
            Ainda sem aprendizados: precisam de pelo menos três peças medidas de cada lado. Cole prints dos Insights e eles nascem sozinhos.
          </p>
        )}
      </section>

      <section className="osSection">
        <h2>
          Publicado <span className="osCount">{pieces.length}</span>
        </h2>
        {pieces.length ? (
          <div className="osRows">
            {pieces.map((i) => {
              const p = performance[i.id];
              return (
                <div className="osRow" key={i.id}>
                  <div>
                    <span className="osRowName">{i.title || i.hook}</span>
                    <p className="osRowSub">
                      {i.platform === 'instagram' ? 'Instagram' : 'TikTok'}
                      {i.track !== 'main' ? ` · ${i.trackLabel}` : ''}
                      {i.functionLabel ? ` · ${i.functionLabel}` : ''}
                      {i.status === 'recorded' ? ' · gravada, por publicar' : ''}
                    </p>
                    {p ? (
                      <p className="osRowSub">
                        {[
                          p.views !== null ? `${p.views} views` : '',
                          p.reach !== null ? `${p.reach} contas` : '',
                          p.nonFollowerReach !== null ? `${p.nonFollowerReach} não seguidores` : '',
                          p.comments !== null ? `${p.comments} comentários` : '',
                          p.saves !== null ? `${p.saves} saves` : '',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                        {' — '}
                        {p.verdict.because}
                        {p.promoted ? ' Já está no feed.' : ''}
                      </p>
                    ) : (
                      <p className="osRowSub">Sem números ainda.</p>
                    )}
                    <InsightsDrop ideaId={i.id} compact />
                  </div>
                  <div className="osRowSide">
                    <Link className="chip" href={`/dashboard/content?idea=${i.id}`}>Ver</Link>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="osRowSub">Nada publicado ainda. Quando marcar uma ideia como gravada ou publicada, aparece aqui.</p>
        )}
      </section>
    </>
  );
}
