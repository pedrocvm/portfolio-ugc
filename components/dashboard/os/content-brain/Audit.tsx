'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import {
  BUCKET_LABEL,
  PERIOD_LABEL,
  type AuditBucket,
  type AuditConclusion,
  type AuditPeriod,
} from '@/modules/content-brain/audit';
import { OUTCOME_LABEL } from '@/modules/content-brain/experiments';
import type { AuditScreen, EvidencePack } from '@/modules/content-brain/audit-service';
import { createTestFrom, respondToRecommendationAction } from '@/app/dashboard/content-audit-actions';
import AuditChart from './AuditChart';
import EvidenceDrawer from './EvidenceDrawer';
import HelpNote from './HelpNote';

/** A Auditoria.
 *
 *  A primeira coisa da tela não é uma parede de métricas: é o que mudou, o que
 *  aprendemos e o que vale testar agora. Os números completos ficam por baixo,
 *  para quando ela quiser investigar — nunca à frente da conclusão.
 *
 *  Três regras que esta tela não quebra:
 *
 *  - **Não se preenche espaço.** Sem conclusões, aparece a frase honesta sobre
 *    o que ainda falta, não seis cartões de zeros.
 *  - **Toda a conclusão abre a prova.** «Ver evidências» está em cada uma.
 *  - **Nada técnico aparece.** Token, versão da API, nome de trabalho e
 *    janela de snapshot vivem em Definições, não aqui. */

const PERIODOS: AuditPeriod[] = ['7d', '30d', '90d', 'all'];

const BUCKET_ORDER: AuditBucket[] = ['improved', 'worsened', 'learned', 'attention'];

const HORA = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Lisbon' });

export default function Audit({
  screen,
  explore,
  benchPack = null,
}: {
  screen: AuditScreen;
  explore: React.ReactNode;
  /** Só a bancada preenche isto (ver `EvidenceDrawer.initialPack`). */
  benchPack?: EvidencePack | null;
}) {
  const { health, run, nextTest, recommendations, experiments, evolution, movements, range, period } = screen;
  const conclusoes = run?.conclusions ?? [];
  const porBalde = BUCKET_ORDER.map((b) => [b, conclusoes.filter((c) => c.bucket === b)] as const).filter(([, l]) => l.length);
  const outras = recommendations.filter((r) => r.id !== nextTest?.id);

  return (
    <>
      {/* ── Cabeçalho ─────────────────────────────────────────────────────── */}
      <section className="auHeader">
        <div className="auAccount">
          <span className="auAvatar" aria-hidden="true">
            {(health.username ?? '?').slice(0, 1).toUpperCase()}
          </span>
          <div>
            <span className="auHandle">{health.username ? `@${health.username}` : 'Instagram'}</span>
            <p className="osNote" data-health={health.state}>
              {health.line}
              {health.followersCount !== null ? ` · ${new Intl.NumberFormat('pt-BR').format(health.followersCount)} seguidores` : ''}
            </p>
          </div>
        </div>

        <nav className="auPeriods" aria-label="Período">
          {PERIODOS.map((p) => (
            <Link
              key={p}
              href={`/dashboard/content?tab=audit&period=${p}`}
              aria-current={p === period ? 'true' : undefined}
              scroll={false}
            >
              {PERIOD_LABEL[p]}
            </Link>
          ))}
        </nav>
      </section>

      {health.state === 'auth_required' ? (
        <p className="osWarn">
          É preciso reconectar o Instagram. Enquanto isso, continuo mostrando tudo o que já guardei —
          só não entra nada novo.
        </p>
      ) : null}

      {/* ── Camada 1: a auditoria ─────────────────────────────────────────── */}
      <section className="osSection auNow">
        <h2>O que aconteceu {periodoEmFrase(period, range.label)}</h2>

        {conclusoes.length === 0 ? (
          <p className="osEmpty">
            {run?.coverage ??
              'Ainda estamos construindo o histórico. Já estou guardando os próximos Stories e publicações; as primeiras comparações aparecem assim que houver amostra suficiente.'}
          </p>
        ) : (
          <>
            {porBalde.map(([bucket, lista]) => (
              <div className="auBucket" key={bucket}>
                <h3>{BUCKET_LABEL[bucket]}</h3>
                <ul className="auConclusions">
                  {lista.map((c) => (
                    <Conclusion key={c.key} c={c} benchPack={benchPack} />
                  ))}
                </ul>
              </div>
            ))}
            {run ? (
              <p className="osNote auCoverage">{run.coverage} Fechado em {HORA(run.generatedAt)}.</p>
            ) : null}
          </>
        )}

        <HelpNote question="Como é que isto é decidido?">
          <p>
            Eu comparo cada conteúdo com os seus próprios conteúdos parecidos e com a mesma idade de
            publicação — nunca com uma média de creator nenhuma. Uma peça de duas horas não é
            comparada com uma de trinta dias.
          </p>
          <p>
            Uma conclusão só aparece quando existem conteúdos suficientes para a sustentar, e o
            número deles está sempre escrito ao lado. Quando não há, eu digo que ainda não sei.
          </p>
        </HelpNote>
      </section>

      {/* ── Próximo teste ─────────────────────────────────────────────────── */}
      {nextTest ? (
        <section className="osSection auNext">
          <h2>O próximo teste que vale fazer</h2>
          <p className="auNextStatement">{nextTest.statement}</p>
          {nextTest.because ? <p className="osNote">{nextTest.because}</p> : null}
          <p className="osNote">
            Baseado em {nextTest.sampleSize} {nextTest.sampleSize === 1 ? 'conteúdo' : 'conteúdos'}.
          </p>
          <EvidenceDrawer
            statement={nextTest.statement}
            because={nextTest.because}
            sample={`${nextTest.sampleSize}`}
            evidence={nextTest.evidence}
            initialPack={benchPack}
          />
          <RecommendationActions rec={nextTest} primary />
        </section>
      ) : null}

      {outras.length ? (
        <section className="osSection">
          <h2>Outras recomendações</h2>
          <div className="osRows">
            {outras.map((r) => (
              <div className="osRow auRec" key={r.id}>
                <div>
                  <span className="osRowName">{r.statement}</span>
                  {r.because ? <p className="osRowSub">{r.because}</p> : null}
                  <p className="osNote">
                    {r.sampleSize} {r.sampleSize === 1 ? 'conteúdo' : 'conteúdos'}
                  </p>
                  <EvidenceDrawer statement={r.statement} because={r.because} evidence={r.evidence} initialPack={benchPack} />
                  <RecommendationActions rec={r} />
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* ── Evolução ──────────────────────────────────────────────────────── */}
      <section className="osSection">
        <h2>Evolução</h2>
        <AuditChart points={evolution.current} label={range.label} />
        {movements.some((m) => m.direction === 'up' || m.direction === 'down') ? (
          <ul className="auMovements">
            {movements
              .filter((m) => m.direction === 'up' || m.direction === 'down')
              .map((m) => (
                <li key={m.metric} data-direction={m.direction}>
                  <span>{m.label.replace(/^(as|os) /, '')}</span>
                  <b>
                    {m.direction === 'up' ? '+' : '−'}
                    {Math.round(Math.abs(m.change ?? 0) * 100)}%
                  </b>
                  <span className="osNote">
                    {m.sample.current} dias medidos contra {m.sample.previous}
                  </span>
                </li>
              ))}
          </ul>
        ) : (
          <p className="osNote">
            Ainda não tenho dias medidos suficientes dos dois lados para dizer se subiu ou desceu.
          </p>
        )}
      </section>

      {/* ── Testes ────────────────────────────────────────────────────────── */}
      <section className="osSection">
        <h2>Testes</h2>
        {experiments.length === 0 ? (
          <p className="osEmpty">
            Nenhum teste aberto. Quando uma recomendação virar teste, ele aparece aqui e eu passo a
            acompanhar as peças dos dois lados.
          </p>
        ) : (
          <div className="osRows">
            {experiments.map((e) => (
              <div className="osRow auExperiment" key={e.id}>
                <div>
                  <span className="osRowName">{e.label}</span>
                  {e.hypothesis ? <p className="osRowSub">{e.hypothesis}</p> : null}
                  {e.because ? <p className="osNote">{e.because}</p> : null}
                  {e.controlMediaIds.length || e.variantMediaIds.length ? (
                    <p className="osNote">
                      {e.controlLabel}: {e.controlMediaIds.length} · {e.variantLabel}: {e.variantMediaIds.length}
                    </p>
                  ) : (
                    <p className="osNote">Ainda sem conteúdos associados dos dois lados.</p>
                  )}
                </div>
                <div className="osRowSide">
                  <span className="osTag" data-tone={e.outcome === 'consistent' ? 'won' : e.outcome === 'contrary' ? 'hot' : 'mute'}>
                    {OUTCOME_LABEL[e.outcome]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Investigar ────────────────────────────────────────────────────── */}
      <section className="osSection auExplore">
        <h2 className="osDivider">Explorar dados</h2>
        <p className="osNote">
          Tudo o que está por baixo das conclusões: cada peça, cada sequência de Stories e a escada
          de aprendizado inteira.
        </p>
        {explore}
      </section>
    </>
  );
}

function periodoEmFrase(period: AuditPeriod, label: string): string {
  if (period === 'all') return 'em todo o histórico';
  if (period === 'custom') return 'no período escolhido';
  return `nos últimos ${label}`;
}

function Conclusion({ c, benchPack }: { c: AuditConclusion; benchPack: EvidencePack | null }) {
  return (
    <li data-confidence={c.confidence} data-bucket={c.bucket}>
      <p>{c.text}</p>
      <span className="osNote">
        {c.sample}
        {c.comparator ? ` · comparado com ${c.comparator}` : ''}
      </span>
      <EvidenceDrawer statement={c.text} sample={c.sample} evidence={c.evidence} initialPack={benchPack} />
    </li>
  );
}

/** «Criar teste», «Salvar para depois», «Não foi útil».
 *
 *  A recomendação não termina em texto. «Criar teste» abre o teste já com a
 *  hipótese, a variável e a métrica preenchidas — ela aprova ou ajusta. */
function RecommendationActions({ rec, primary }: { rec: AuditScreen['recommendations'][number]; primary?: boolean }) {
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<string | null>(null);

  const agir = (fn: () => Promise<{ ok: true } | { error: string }>, sucesso: string) =>
    start(async () => {
      setErro(null);
      const r = await fn();
      if ('error' in r) setErro(r.error);
      else setFeito(sucesso);
    });

  if (feito) return <p className="osNote auDone">{feito}</p>;

  return (
    <>
      <div className="auActions">
        {rec.testDraft ? (
          <button
            type="button"
            className={primary ? 'btn' : 'chip'}
            disabled={pending}
            onClick={() => agir(() => createTestFrom(rec.id), 'Teste criado, com a hipótese já preenchida. Está em Testes.')}
          >
            Criar teste
          </button>
        ) : null}
        <button
          type="button"
          className="chip"
          disabled={pending}
          onClick={() => agir(() => respondToRecommendationAction(rec.id, 'dismiss'), 'Salva. Não volto a insistir.')}
        >
          Salvar para depois
        </button>
        <button
          type="button"
          className="chip"
          disabled={pending}
          onClick={() => agir(() => respondToRecommendationAction(rec.id, 'not_useful'), 'Anotado. Uso isso para priorizar melhor — os dados ficam.')}
        >
          Não foi útil
        </button>
      </div>
      {erro ? <p className="osWarn">{erro}</p> : null}
    </>
  );
}
