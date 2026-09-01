'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import {
  approveOutreach, clearManualSearch, discardMany, draftOutreach, saveCandidates,
  sendApprovedOutreach, sendOutreach, skipOutreach, startDiscovery, startManualSearch,
  suppressBrand, updateOutreachDraft,
} from '@/app/dashboard/outreach-actions';
import Spinner from '@/components/dashboard/Spinner';
import { watchDiscovery } from '@/components/dashboard/DiscoveryWatch';
import { pushToast } from '@/components/dashboard/Toasts';
import { formatDate } from '@/lib/time';
import {
  CONF_LABEL, UGC_LABEL, countryLabel, placeLabel, signalsFor,
} from '@/modules/outreach/history';
import {
  LIMITS, SECTION_HINT, SECTION_TITLE, groupForReview,
} from '@/modules/outreach/domain';
import { nicheShort } from '@/modules/brands/niches';
import type { Focus } from '@/modules/outreach/focus';
import CountryPicker from './CountryPicker';
import FocusEditor from './FocusEditor';
import ResultsBar, { type ManualRun } from './ResultsBar';

/** A revisão diária.
 *
 *  O objetivo é ela decidir em segundos: porquê esta marca, quanto vale, e o
 *  email já escrito. Tudo o resto está a um toque, dobrado. */

export type Candidate = {
  id: string; name: string; website: string | null; country: string | null;
  niche_id: string | null; fit_score: number | null; fit_band: string | null;
  product: string | null; why_fit: string; why_now: string; why_may_pay: string; risk: string;
  paid_media_signal: string | null; ugc_signal: string | null;
  creative_opportunity: string; content_ideas: { title: string; angle: string }[];
  red_flags: string[]; sources: { label: string; url: string | null }[];
  contact_name: string | null; contact_role: string | null; contact_email: string | null;
  email_confidence: string | null; contact_source: string | null; subject: string; body: string;
  socials: Record<string, string | null> | null;
  city: string | null;
  instagram: string | null;
  whatsapp: string | null;
  phone: string | null;
  search_relevance: number | null;
  ugc_opportunity: number | null;
  saved: boolean;
  quality: { pass: boolean; score: number; failures: string[] } | null;
  status: string; sent_at: string | null;
};

/** O que o número quer dizer. Numa busca dirigida a pergunta é «corresponde ao
 *  que pedi?»; na automática é «encaixa no que faço?». São perguntas
 *  diferentes e não podem partilhar o mesmo rótulo. */
function scoreFor(c: Candidate): { n: number | null; label: string } {
  // O número e a banda têm de vir do mesmo valor. Mostrar o dígito de um e a
  // palavra de outro dava «61 · Excelente», que é pior do que não dizer nada.
  const manual = c.search_relevance !== null;
  const n = manual ? (c.ugc_opportunity ?? c.fit_score) : c.fit_score;
  const banda = n === null ? '' : n >= 80 ? 'Excelente' : n >= 65 ? 'Bom' : n >= 45 ? 'Razoável' : 'Fraco';
  return { n, label: `${manual ? 'Potencial' : 'Encaixe'} · ${banda}` };
}

function Card({ c }: { c: Candidate }) {
  const [pending, start] = useTransition();
  const [running, setRunning] = useState('');
  const [gone, setGone] = useState(false);
  const [msg, setMsg] = useState('');
  const [subject, setSubject] = useState(c.subject);
  const [body, setBody] = useState(c.body);
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState(c.status);
  // Abaixo do corte de encaixe: pesquisada, guardada, sem email escrito. O
  // email custa uma chamada ao modelo e só se escreve se ela quiser esta marca.
  const semEmail = !subject && !body;

  if (gone) return null;

  const score = scoreFor(c);
  const pronta = status === 'ready' || status === 'approved' || status === 'edited';

  const run = (id: string, fn: () => Promise<{ error?: string }>, after?: () => void) => {
    setRunning(id);
    start(async () => {
      const r = await fn();
      setRunning('');
      if (r.error) setMsg(r.error);
      else after?.();
    });
  };

  const dirty = subject !== c.subject || body !== c.body;

  return (
    <details className="revRow" data-status={status}>
      <summary>
        <span className="revName">{c.name}</span>
        {nicheShort(c.niche_id) ? <span className="revNiche">{nicheShort(c.niche_id)}</span> : null}

        {/* Uma linha só, para ela saber se vale a pena abrir. */}
        <span className="revWhy">{c.product ?? c.why_fit}</span>

        {placeLabel(c) ? <span className="revWhere">{placeLabel(c)}</span> : null}

        <span className="revBadges">
          {signalsFor(c).map((sig) => (
            <span className="revBadge" data-tone={sig.tone} key={sig.text}>
              {sig.text}
            </span>
          ))}
        </span>

        {score.n !== null ? (
          // Um número nu obriga a perguntar «84 de quê?». O rótulo e a banda
          // respondem antes de ela perguntar.
          <span className="revFit" data-over={score.n >= LIMITS.minFitScore ? '' : undefined}>
            <b>{score.n}</b>
            <small>{score.label}</small>
          </span>
        ) : null}

        <span className="revState">{pronta ? 'Ver e enviar' : semEmail ? 'Ver' : 'Ler'}</span>

        {status !== 'sent' ? (
          <button
            className="revX"
            type="button"
            disabled={pending}
            title="Descartar esta marca"
            aria-label={`Descartar ${c.name}`}
            onClick={(e) => {
              // Dentro de um <summary>, um clique abre a linha. Este não.
              e.preventDefault();
              e.stopPropagation();
              run('skip', () => skipOutreach(c.id), () => setGone(true));
            }}
          >
            {running === 'skip' ? <Spinner label="A descartar" /> : '×'}
          </button>
        ) : null}

        {/* Dentro do summary: a barra serve para ler a linha fechada, e fora
            dele só aparecia depois de ela já ter aberto. */}
        {score.n !== null ? (
          <span
            className="revBar"
            data-over={score.n >= LIMITS.minFitScore ? '' : undefined}
            style={{ '--fit': `${Math.min(100, Math.max(0, score.n))}%` } as React.CSSProperties}
            aria-hidden="true"
          />
        ) : null}
      </summary>


      <div className="revBody">

      <p className="osWhy">{c.why_fit}</p>

      <div className="osMeta">
        {countryLabel(c.country) ? <span>{countryLabel(c.country)}</span> : null}
        {c.ugc_signal ? <span>{UGC_LABEL[c.ugc_signal]}</span> : null}
        {c.contact_email ? (
          <span>
            {c.contact_name ?? 'contato'} · <b>{CONF_LABEL[c.email_confidence ?? 'unknown']}</b>
          </span>
        ) : (
          <span>sem contato encontrado</span>
        )}
        {c.website ? (
          <a href={c.website} target="_blank" rel="noreferrer noopener">
            site
          </a>
        ) : null}
      </div>

      {c.quality && !c.quality.pass ? (
        <p className="osWarn">
          O email não passou a revisão automática: {c.quality.failures.join('; ')}.
        </p>
      ) : null}
      {c.email_confidence === 'low' || c.email_confidence === 'unknown' ? (
        <p className="osWarn">
          {/* A razão vem da verificação, não de uma frase genérica: «o domínio
              não recebe email» e «foi deduzido» pedem coisas diferentes. */}
          {c.contact_source?.split(' · ')[1] ?? 'Não consegui confirmar este endereço.'}
        </p>
      ) : null}
      {msg ? <p className="osWarn">{msg}</p> : null}

      <details className="outDetail">
        <summary>Porquê esta marca</summary>
        <div>
          {c.why_now ? <p><b>Agora:</b> {c.why_now}</p> : null}
          {c.why_may_pay ? <p><b>Podem pagar:</b> {c.why_may_pay}</p> : null}
          {c.risk ? <p><b>Risco:</b> {c.risk}</p> : null}
          {c.creative_opportunity ? <p><b>Oportunidade:</b> {c.creative_opportunity}</p> : null}
          {c.red_flags.length ? <p><b>Bandeiras:</b> {c.red_flags.join(', ')}</p> : null}
          {c.content_ideas.length ? (
            <ul>
              {c.content_ideas.map((i) => (
                <li key={i.title}><b>{i.title}</b> — {i.angle}</li>
              ))}
            </ul>
          ) : null}
          {c.sources.length ? (
            <p className="osRowSub">
              Fontes: {c.sources.map((s) => s.label).join(' · ')}
            </p>
          ) : null}
        </div>
      </details>

      {semEmail ? (
        <p className="osRowSub">
          Ficou abaixo do corte de encaixe, por isso não escrevi o email. Se
          gostar da marca, peça e eu escrevo.
        </p>
      ) : null}

      <details className="outDetail" open={status === 'ready' || status === 'edited'} hidden={semEmail}>
        <summary>O email</summary>
        <div className="outMail">
          <label className="visually-hidden" htmlFor={`s-${c.id}`}>Assunto</label>
          <input
            id={`s-${c.id}`}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Assunto"
          />
          <label className="visually-hidden" htmlFor={`b-${c.id}`}>Mensagem</label>
          <textarea id={`b-${c.id}`} rows={12} value={body} onChange={(e) => setBody(e.target.value)} />
          <p className="osRowSub">Para: {c.contact_email ?? '—'}</p>
        </div>
      </details>

      <footer className="osCardActs">
        {status === 'sent' ? (
          <span className="osTag" data-tone="ok">enviado {c.sent_at ? formatDate(c.sent_at) : ''}</span>
        ) : semEmail ? (
          <button
            className="osGo"
            type="button"
            disabled={pending}
            onClick={() =>
              run('draft', async () => {
                const r = await draftOutreach(c.id);
                if (r.subject) {
                  setSubject(r.subject);
                  setBody(r.body ?? '');
                  setStatus('needs_review');
                }
                return r;
              })
            }
          >
            {running === 'draft' ? <Spinner label="A escrever" /> : null}
            Escrever o email
          </button>
        ) : confirming ? (
          <>
            <span className="osRowSub">Enviar para {c.contact_email}?</span>
            <button
              className="osGo"
              type="button"
              disabled={pending}
              onClick={() =>
                run('send', () => sendOutreach(c.id), () => {
                  setStatus('sent');
                  setConfirming(false);
                })
              }
            >
              {running === 'send' ? <Spinner label="A enviar" /> : null}
              Sim, enviar
            </button>
            <button className="osPageBtn" type="button" onClick={() => setConfirming(false)}>
              Não
            </button>
          </>
        ) : (
          <>
            <button
              className="osGo"
              type="button"
              disabled={pending || !c.contact_email}
              onClick={() => setConfirming(true)}
            >
              Enviar
            </button>
            {dirty ? (
              <button
                className="osPageBtn"
                type="button"
                disabled={pending}
                onClick={() => run('save', () => updateOutreachDraft(c.id, subject, body), () => setStatus('edited'))}
              >
                {running === 'save' ? <Spinner label="A salvar" /> : null}
                Salvar
              </button>
            ) : (
              <button
                className="osPageBtn"
                type="button"
                disabled={pending || status === 'approved'}
                onClick={() => run('ok', () => approveOutreach(c.id), () => setStatus('approved'))}
              >
                {running === 'ok' ? <Spinner label="A aprovar" /> : null}
                {status === 'approved' ? 'Aprovado' : 'Aprovar'}
              </button>
            )}

            <details className="osMore">
              <summary aria-label="Mais opções">⋯</summary>
              <div className="osMoreBox">
                <span className="osMoreLabel">Hoje não</span>
                <button type="button" disabled={pending} onClick={() => run('skip', () => skipOutreach(c.id), () => setGone(true))}>
                  Saltar
                </button>
                <span className="osMoreLabel">Voltar a mostrar</span>
                {[30, 60, 90].map((d) => (
                  <button key={d} type="button" disabled={pending} onClick={() => run(`s${d}`, () => suppressBrand(c.id, d as 30), () => setGone(true))}>
                    daqui a {d} dias
                  </button>
                ))}
                <button type="button" disabled={pending} onClick={() => run('never', () => suppressBrand(c.id, 'never'), () => setGone(true))}>
                  Nunca esta marca
                </button>
              </div>
            </details>
          </>
        )}
        </footer>
      </div>
    </details>
  );
}

export default function Outreach({
  candidates,
  runDate,
  enabled,
  focus,
  manualRun,
}: {
  candidates: Candidate[];
  runDate: string | null;
  enabled: boolean;
  focus: Focus;
  manualRun: ManualRun | null;
}) {
  const [pending, start] = useTransition();
  const [running, setRunning] = useState('');
  const [msg, setMsg] = useState('');
  const [ask, setAsk] = useState(manualRun?.raw_query ?? '');
  const [pais, setPais] = useState(manualRun?.countries?.[0] ?? 'Portugal');
  // Um modo de cada vez, e não dois conjuntos de controlos na mesma tela: a
  // busca dirigida obedece ao que ela escreve, a automática ao foco guardado.
  const [modo, setModo] = useState<'manual' | 'auto'>('manual');

  const approved = candidates.filter((c) => c.status === 'approved').length;

  const run = (id: string, fn: () => Promise<{ error?: string; sent?: number; message?: string }>) => {
    setRunning(id);
    start(async () => {
      const r = await fn();
      setRunning('');
      setMsg(r.error ?? (r.sent !== undefined ? `${r.sent} enviados.` : (r.message ?? '')));
    });
  };

  return (
    <>
      <div className="dashBar">
        <h1>Prospecção</h1>
        {runDate ? <span className="dashState">lote de {formatDate(runDate)}</span> : null}
        <Link className="osMore" href="/dashboard/outreach/history">
          Histórico
        </Link>
      </div>

      <p className="osBrief">
        Procure uma coisa concreta, ou deixe o CarolOS trazer marcas todas as manhãs.
      </p>

      <div className="modos" role="tablist" aria-label="Modo de procura">
        <button
          role="tab"
          type="button"
          aria-selected={modo === 'manual'}
          onClick={() => setModo('manual')}
        >
          Procurar agora
        </button>
        <button
          role="tab"
          type="button"
          aria-selected={modo === 'auto'}
          onClick={() => setModo('auto')}
        >
          Busca automática
        </button>
      </div>

      {modo === 'auto' && !enabled ? (
        <p className="osWarn" data-tone="info">
          A prospecção diária está desligada. Ligue em Definições para o CarolOS procurar marcas
          novas todas as manhãs — nunca envia nada sozinho.
        </p>
      ) : null}

      {modo === 'auto' ? (
        <>
          <FocusEditor initial={focus} />
          <div className="osJobs">
            <button
              className="osJob"
              data-primary=""
              type="button"
              disabled={pending}
              onClick={() =>
                // Não se espera pela corrida: são minutos. Arranca, avisa, e o
                // resto da aplicação continua a responder.
                run('now', async () => {
                  const r = await startDiscovery();
                  if (r.since) {
                    watchDiscovery(r.since);
                    pushToast('Procura começada. Aviso quando acabar — pode continuar a trabalhar.');
                  }
                  return r;
                })
              }
            >
              {running === 'now' ? <Spinner label="A começar" /> : null}
              Procurar agora com este foco
            </button>
            {approved > 0 ? (
              <button
                className="osJob"
                type="button"
                disabled={pending}
                onClick={() => run('bulk', () => sendApprovedOutreach())}
              >
                {running === 'bulk' ? <Spinner label="A enviar" /> : null}
                Enviar os {approved} aprovados
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      {modo === 'manual' ? (
        <>
          <form
            className="buscaBox"
            onSubmit={(e) => {
              e.preventDefault();
              if (!ask.trim()) return;
              run('ask', async () => {
                const r = await startManualSearch(ask.trim(), pais);
                if (r.since) {
                  watchDiscovery(r.since);
                  pushToast(`A procurar «${ask.trim()}» em ${pais}. Aviso quando acabar.`);
                }
                return r;
              });
            }}
          >
            <label className="buscaLabel" htmlFor="busca-q">
              O que quer procurar?
            </label>
            <div className="buscaLinha">
              <input
                id="busca-q"
                value={ask}
                onChange={(e) => setAsk(e.target.value)}
                placeholder="hotéis boutique, restaurantes italianos, clínicas dentárias…"
              />
              <CountryPicker value={pais} onChange={setPais} disabled={pending} />
              <button className="osGo" type="submit" disabled={pending || !ask.trim()}>
                {running === 'ask' ? <Spinner label="A procurar" /> : null}
                Procurar
              </button>
            </div>
            <p className="buscaNota">
              O que escrever aqui manda. Se pedir hotéis, vêm hotéis — o seu foco
              habitual serve só para ordenar os que aparecerem.
            </p>
          </form>

          {manualRun ? (
            <ResultsBar
              run={manualRun}
              count={candidates.length}
              pending={pending}
              onSaveAll={() =>
                run('saveall', async () => {
                  const r = await saveCandidates(candidates.map((c) => c.id));
                  if (r.saved) pushToast(`${r.saved} guardadas no histórico.`);
                  return r;
                })
              }
              onClear={() =>
                run('clear', async () => {
                  const r = await clearManualSearch();
                  pushToast(
                    r.error ?? `Busca limpa. O que guardou fica no histórico.`,
                    r.error ? 'warn' : 'ok',
                  );
                  return r;
                })
              }
            />
          ) : null}
        </>
      ) : null}

      {msg ? <p className="osWarn" data-tone="info">{msg}</p> : null}

      {candidates.length === 0 ? (
        <p className="osEmpty">
          Nenhuma marca nova atingiu o nível de qualidade hoje. É melhor assim do que encher a
          lista com o que não presta.
        </p>
      ) : (
        groupForReview(candidates).map(({ section, rows }) => (
          <section className="revSection" key={section}>
            <header>
              <h2>
                {SECTION_TITLE[section]}
                <span className="revCount">{rows.length}</span>
              </h2>
              <p>{SECTION_HINT[section]}</p>
            </header>
            <div className="revList">
              {rows.map((c) => (
                <Card key={c.id} c={c} />
              ))}
            </div>
            {section === 'below' && rows.length > 1 ? (
              <button
                className="osPageBtn revClear"
                type="button"
                disabled={pending}
                onClick={() =>
                  run(`clear-${section}`, async () => {
                    const r = await discardMany(rows.map((c) => c.id));
                    if (r.discarded) pushToast(`${r.discarded} marcas de lado.`);
                    return r;
                  })
                }
              >
                {running === `clear-${section}` ? <Spinner label="A descartar" /> : null}
                Descartar as {rows.length} abaixo do corte
              </button>
            ) : null}
          </section>
        ))
      )}
    </>
  );
}
