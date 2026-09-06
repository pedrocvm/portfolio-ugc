'use client';

import Link from 'next/link';
import { useState } from 'react';
import Segmented from '@/components/dashboard/Segmented';
import type { FeedAuditView, StoryAuditView } from '@/modules/content-brain/performance-service';
import Performance, { type LearningView, type PieceView } from './Performance';

/** Publicado, em três leituras: o que aprendemos, o Feed peça a peça, e os
 *  Stories por sequência.
 *
 *  Não é um painel de totais. Cada linha responde a «o que isso muda no que
 *  fazemos?» — e quando a resposta é «ainda não sei», é isso que está escrito,
 *  com a amostra ao lado. Um vídeo bom não vira regra; um grupo de duas peças
 *  não conclui nada.
 *
 *  Feed e Stories são coisas diferentes e ficam separados: um Story vive 24 h
 *  e lê-se em sequência; uma peça do Feed vive meses e lê-se contra a mediana
 *  dela. O que veio antes da captura automática não existe na API, e a tela
 *  diz desde quando existe. */

const VISTAS = [
  { id: 'learn', label: 'Aprendizados' },
  { id: 'feed', label: 'Feed' },
  { id: 'stories', label: 'Stories' },
] as const;
type Vista = (typeof VISTAS)[number]['id'];

const CONFIANCA: Record<string, string> = { low: 'confiança baixa', medium: 'confiança média', high: 'confiança alta' };

const dia = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Europe/Lisbon' });

const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);
const n = (x: number | null) => (x === null ? 'indisponível' : new Intl.NumberFormat('pt-BR').format(x));

export default function ContentIntelligence({
  pieces,
  learnings,
  lastSyncAt,
  feed,
  stories,
  initial = 'learn',
}: {
  pieces: PieceView[];
  learnings: LearningView[];
  lastSyncAt: string | null;
  feed: FeedAuditView;
  stories: StoryAuditView;
  initial?: Vista;
}) {
  const [vista, setVista] = useState<Vista>(initial);

  return (
    <>
      <div className="csTabs ciTabs">
        <Segmented options={VISTAS.map((v) => ({ id: v.id, label: v.label }))} value={vista} onChange={setVista} label="Publicado" />
      </div>

      {vista === 'learn' ? (
        <>
          <section className="osSection">
            <h2>O que estamos aprendendo até agora</h2>
            <p className="osNote">
              {feed.sample.total} {feed.sample.total === 1 ? 'peça' : 'peças'} do Feed importadas · {feed.sample.comparable} com métrica comparável ·{' '}
              {feed.sample.legacy} anteriores ao CarolOS
              {lastSyncAt ? ` · última leitura ${dia(lastSyncAt)}` : ''}
            </p>
            <ul className="ciPoints">
              {feed.summary.map((p, i) => (
                <li key={i} data-confidence={p.confidence}>
                  <p>{p.text}</p>
                  <span className="osNote">
                    {p.sample} · {CONFIANCA[p.confidence]}
                    {p.evidence.length ? ` · ${p.evidence.length} ${p.evidence.length === 1 ? 'peça como prova' : 'peças como prova'}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <Performance pieces={pieces} learnings={learnings} lastSyncAt={lastSyncAt} />
        </>
      ) : null}

      {vista === 'feed' ? (
        <section className="osSection">
          <h2>Feed, peça a peça</h2>
          <p className="osNote">
            Cada leitura é relativa à sua própria mediana, entre peças da mesma idade. Uma peça de 2024 compara-se com as
            antigas pela leitura atual; uma de ontem, pela janela em que está. Métrica indisponível é indisponível — nunca
            zero.
          </p>
          {feed.pieces.length === 0 ? (
            <p className="osEmpty">Ainda não importei nenhuma peça do Feed.</p>
          ) : (
            <div className="osRows">
              {feed.pieces.map((p) => (
                <details className="osRow ciPiece" key={p.mediaId}>
                  <summary>
                    <div>
                      <span className="osRowName">{p.title}</span>
                      <p className="osRowSub">
                        {dia(p.publishedAt)} · {p.audit.format}
                        {p.tags.theme ? ` · ${p.tags.theme}` : ''}
                        {p.pillarLabel ? ` · ${p.pillarLabel}` : ''}
                      </p>
                      <p className="ciRelative" data-weak={!p.readings.some((r) => r.comparable) || undefined}>{p.audit.relativeLine}</p>
                    </div>
                    <div className="osRowSide">
                      {p.audit.signals.length ? <span className="osTag" data-tone="hot">{p.audit.signals.length === 1 ? 'sinal' : `${p.audit.signals.length} sinais`}</span> : null}
                      <span className="osTag" data-tone="mute">{p.audit.sample}</span>
                    </div>
                  </summary>
                  <dl className="ciAudit">
                    <dt>Função</dt>
                    <dd>{p.audit.function}</dd>
                    <dt>Formato</dt>
                    <dd>
                      {p.audit.format}
                      {p.tags.source === 'ai_caption' ? <span className="ciSource"> · pela legenda{p.tags.confidence !== null ? `, confiança ${Math.round(p.tags.confidence * 100)}%` : ''}</span> : null}
                      {p.tags.source === 'story_link' ? <span className="ciSource"> · pela história ligada</span> : null}
                    </dd>
                    <dt>Tema</dt>
                    <dd>{p.audit.theme}</dd>
                    <dt>Gancho</dt>
                    <dd>{p.audit.hook}</dd>
                    <dt>Engajamento</dt>
                    <dd>{p.audit.engagementQuality}</dd>
                    {p.audit.signals.length ? (
                      <>
                        <dt>Sinais</dt>
                        <dd>{p.audit.signals.join(' · ')}</dd>
                      </>
                    ) : null}
                    <dt>Hipótese</dt>
                    <dd>{p.audit.hypothesis}</dd>
                    <dt>Próximo teste</dt>
                    <dd>{p.audit.nextTest}</dd>
                  </dl>
                  {p.permalink ? (
                    <Link className="chip" href={p.permalink} target="_blank" rel="noreferrer">
                      Ver no Instagram
                    </Link>
                  ) : null}
                </details>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {vista === 'stories' ? (
        <>
          <section className="osSection">
            <h2>Stories</h2>
            <p className="osNote">{stories.coverage.line}</p>
            {stories.active + stories.expired > 0 ? (
              <p className="osNote">
                {stories.active} {stories.active === 1 ? 'ativo' : 'ativos'} · {stories.expired}{' '}
                {stories.expired === 1 ? 'expirado e salvo' : 'expirados e salvos'} · {stories.sequences.length}{' '}
                {stories.sequences.length === 1 ? 'sequência' : 'sequências'}
              </p>
            ) : null}
          </section>

          <section className="osSection">
            <h2>O que as sequências ensinam</h2>
            {stories.guidance.lines.length ? (
              <ul className="ciPoints">
                {stories.guidance.lines.map((l, i) => (
                  <li key={i} data-confidence={l.confidence}>
                    <p>{l.text}</p>
                    <span className="osNote">{l.sample} · {CONFIANCA[l.confidence]}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="osNote">{stories.guidance.because}</p>
          </section>

          {stories.sequences.length ? (
            <section className="osSection">
              <h2>Sequências</h2>
              <div className="osRows">
                {stories.sequences.map((s) => (
                  <details className="osRow ciPiece" key={s.id}>
                    <summary>
                      <div>
                        <span className="osRowName">{s.label}</span>
                        <p className="osRowSub">
                          {s.storyCount} {s.storyCount === 1 ? 'Story' : 'Stories'} · {dia(s.startedAt)}
                          {s.tags.length ? ` · ${s.tags.join(', ')}` : ''}
                          {s.locked ? ' · corrigida por você' : ''}
                        </p>
                        <p className="ciRelative" data-weak={s.metrics.coverage !== 'complete' || undefined}>
                          Começaram: {n(s.metrics.firstReach)} · Último: {n(s.metrics.lastReach)} · Reach-retention proxy: {pct(s.metrics.reachRetentionProxy)} · Respostas:{' '}
                          {n(s.metrics.replies)}
                        </p>
                        {s.comparison ? <p className="osRowSub">{s.comparison}</p> : null}
                        {s.metrics.coverage !== 'complete' ? (
                          <p className="osRowSub">
                            {s.metrics.coverage === 'none' ? 'Nenhum frame medido ainda.' : `${s.metrics.measured} de ${s.storyCount} frames medidos.`}
                          </p>
                        ) : null}
                      </div>
                    </summary>
                    <ol className="ciFrames">
                      {s.frames.map((f, i) => (
                        <li key={f.id}>
                          <span>{i + 1}</span>
                          <span>{new Date(f.publishedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Lisbon' })}</span>
                          <span>alcance {n(f.reach)}</span>
                          <span>respostas {n(f.replies)}</span>
                          <span>{f.expiredAt ? 'expirado' : 'ativo'}</span>
                        </li>
                      ))}
                    </ol>
                  </details>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </>
  );
}
