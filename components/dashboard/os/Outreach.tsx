'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import {
  approveOutreach, clearManualSearch, discardMany, draftOutreach, saveCandidates,
  recheckOutreachEmails,
  sendApprovedOutreach, sendOutreach, skipOutreach, startDiscovery, startManualSearch,
  updateOutreachEmail,
  suppressBrand, updateOutreachDraft, type BrandReferenceRow,
} from '@/app/dashboard/outreach-actions';
import Spinner from '@/components/dashboard/Spinner';
import { watchDiscovery } from '@/components/dashboard/DiscoveryWatch';
import { pushToast } from '@/components/dashboard/Toasts';
import { formatDate } from '@/lib/time';
import { MAILBOX_FIT_NOTE, mailboxFit } from '@/modules/outreach/mailcheck';
import {
  CONF_LABEL, UGC_LABEL, countryLabel, placeLabel, signalsFor,
} from '@/modules/outreach/history';
import {
  LIMITS, SECTION_HINT, SECTION_TITLE, groupForReview, sectionFor,
} from '@/modules/outreach/domain';
import { nicheShort } from '@/modules/brands/niches';
import { FRESHNESS_LABEL, type Freshness } from '@/modules/references/domain';
import type { Focus } from '@/modules/outreach/focus';
import CountryPicker from './CountryPicker';
import FocusEditor from './FocusEditor';
import ReviewMode from './ReviewMode';
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
  contact_email_options?: { address: string; team: string | null; where: string | null }[] | null;
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
  /** O conceito que o CarolOS recomenda gravar para esta marca, tirado das
   *  referências que separou de madrugada. */
  creative_angle: string | null;
  ready_idea: ReadyIdea | null;
  references_state: string | null;
  references_note: string | null;
};

export type ReadyIdea = {
  creative_angle: string;
  title: string;
  hook: string;
  script: string;
  shot_list: { shot: string; note: string | null; required: boolean }[];
  b_roll: string[];
  on_screen_text: string[];
  editing_notes: string;
  cta: string;
  duration_seconds: number | null;
  props: string[];
  location: string;
  why_this_brand: string;
};

/** A ideia pronta a gravar, tirada das referências.
 *
 *  «Ideia: fazer um vídeo a mostrar o produto» não é trabalho preparado. Isto é
 *  o que se põe no tripé — e por isso vem com tomadas numeradas, texto na tela
 *  e notas de edição, não com uma frase. */
function ReadyIdeaBlock({ idea }: { idea: ReadyIdea }) {
  return (
    <div className="refIdea">
      <h4>{idea.title || 'Pronto a gravar'}</h4>
      <p className="refHook">«{idea.hook}»</p>
      {idea.script ? <p className="refScript">{idea.script}</p> : null}
      {idea.shot_list.length ? (
        <ol className="refShots">
          {idea.shot_list.map((s, i) => (
            <li key={i}>
              {s.shot}
              {s.note ? <span> — {s.note}</span> : null}
              {s.required === false ? <span className="refOpt"> (opcional)</span> : null}
            </li>
          ))}
        </ol>
      ) : null}
      <dl className="refPlan">
        {idea.on_screen_text.length ? (
          <>
            <dt>Texto na tela</dt>
            <dd>{idea.on_screen_text.join(' · ')}</dd>
          </>
        ) : null}
        {idea.editing_notes ? (
          <>
            <dt>Edição</dt>
            <dd>{idea.editing_notes}</dd>
          </>
        ) : null}
        {idea.props.length ? (
          <>
            <dt>Adereços</dt>
            <dd>{idea.props.join(', ')}</dd>
          </>
        ) : null}
        {idea.location ? (
          <>
            <dt>Onde</dt>
            <dd>{idea.location}</dd>
          </>
        ) : null}
        {idea.cta ? (
          <>
            <dt>Remate</dt>
            <dd>{idea.cta}</dd>
          </>
        ) : null}
      </dl>
    </div>
  );
}

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

function Card({ c, refs }: { c: Candidate; refs: BrandReferenceRow[] }) {
  const [pending, start] = useTransition();
  const [running, setRunning] = useState('');
  const [gone, setGone] = useState(false);
  const [msg, setMsg] = useState('');
  const [subject, setSubject] = useState(c.subject);
  const [body, setBody] = useState(c.body);
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState(c.status);
  const [para, setPara] = useState(c.contact_email ?? '');
  const [aTrocarPara, setATrocarPara] = useState(false);
  /** O comprovativo do envio: de onde saiu e para onde foi. Fica no cartão
   *  depois de a mensagem sair, porque «enviado» sem endereço não prova nada a
   *  quem carregou no botão. */
  const [comprovativo, setComprovativo] = useState<{ from: string; to: string } | null>(null);
  /** Quando o rascunho foi salvo da última vez. Serve para lhe dizer. */
  const [salvoEm, setSalvoEm] = useState<string | null>(null);
  // Abaixo do corte de encaixe: pesquisada, salva, sem email escrito. O
  // email custa uma chamada ao modelo e só se escreve se ela quiser esta marca.
  const semEmail = !subject && !body;

  if (gone) return null;

  const score = scoreFor(c);
  const pronta = status === 'ready' || status === 'approved' || status === 'edited';

  /** Nenhuma ação acaba em silêncio.
   *
   *  O erro aparecia numa linha no topo do cartão e o botão está no fim dele:
   *  ela carregava em «enviar», nada mudava à frente dos olhos, e a razão
   *  ficava a um ecrã de distância. Agora a mensagem fica ao pé do botão e
   *  também salta num aviso, que se vê com o cartão fechado. */
  const run = (
    id: string,
    fn: () => Promise<{ error?: string; note?: string }>,
    after?: () => void,
  ) => {
    setRunning(id);
    setMsg('');
    start(async () => {
      const r = await fn();
      setRunning('');
      if (r.error) {
        setMsg(r.error);
        pushToast(r.error, 'warn');
        return;
      }
      if (r.note) {
        setMsg(r.note);
        pushToast(r.note, 'warn');
      }
      after?.();
    });
  };

  const dirty = subject !== c.subject || body !== c.body;

  /** Salva o rascunho sem ela ter de pedir.
   *
   *  O que ela escrevia vivia só no estado do componente: o «Salvar» era um
   *  botão a mais para carregar, e quem não carregasse perdia a edição ao
   *  recarregar a página. Pior — o envio lê o assunto e o corpo da BASE, por
   *  isso uma edição por salvar saía com o texto antigo, sem aviso nenhum.
   *
   *  Salva-se quando ela sai do campo, e outra vez antes de enviar. */
  const salvarRascunho = async (): Promise<{ error?: string }> => {
    if (!dirty) return {};
    setRunning('save');
    const r = await updateOutreachDraft(c.id, subject, body);
    setRunning('');
    if (r.error) {
      setMsg(r.error);
      pushToast(`${c.name}: ${r.error}`, 'warn');
      return r;
    }
    setStatus('edited');
    setSalvoEm(new Date().toISOString());
    return {};
  };

  const salvarAoSair = () => {
    if (dirty) start(() => void salvarRascunho());
  };

  // As outras caixas que a pesquisa viu e não escolheu. Trocar tem de ser um
  // toque: quando o palpite sai ao lado, ela já sabe qual é o certo.
  const opcoes = c.contact_email_options ?? [];

  // Só se avisa quando a caixa não é a de quem decide. `marketing@` não precisa
  // de etiqueta nenhuma — o silêncio é que diz que está bem.
  const caixa = para ? mailboxFit(para) : null;
  const avisoCaixa = caixa && caixa !== 'target' ? MAILBOX_FIT_NOTE[caixa] : null;

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
            {running === 'skip' ? <Spinner label="Descartando" /> : '×'}
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

      {/* As referências servem por dentro: nunca vão no cold email — mandar
          links de concorrentes a uma marca é uma forma rápida de não ter
          resposta. O que vai para o email é uma ideia melhor por causa delas. */}
      {refs.length ? (
        <details className="outDetail outRefs">
          <summary>
            {refs.length === 1 ? '1 referência separada' : `${refs.length} referências separadas`}
            {c.creative_angle ? ' · 1 conceito recomendado' : ''}
          </summary>
          <div>
            {c.creative_angle ? <p className="refAngle">{c.creative_angle}</p> : null}
            <ol className="refList">
              {refs.map((r) => (
                <li key={r.id}>
                  <a href={r.url} target="_blank" rel="noreferrer noopener">
                    {r.title || r.url}
                  </a>
                  <span className="refMeta">
                    {r.platform}
                    {r.creatorHandle ? ` · ${r.creatorHandle}` : ''}
                    {r.freshness && r.freshness !== 'unknown' ? ` · ${FRESHNESS_LABEL[r.freshness as Freshness] ?? r.freshness}` : ''}
                  </span>
                  {r.whyItWorks ? <p><b>Porque funciona:</b> {r.whyItWorks}</p> : null}
                  {r.adaptation ? <p><b>Adaptar assim:</b> {r.adaptation}</p> : null}
                  {r.doNotCopy ? <p className="refNo"><b>Não copiar:</b> {r.doNotCopy}</p> : null}
                </li>
              ))}
            </ol>
            {c.ready_idea ? <ReadyIdeaBlock idea={c.ready_idea} /> : null}
          </div>
        </details>
      ) : c.references_state === 'empty' || c.references_state === 'failed' ? (
        <p className="osRowSub">{c.references_note || 'Não encontrei referências utilizáveis para esta marca.'}</p>
      ) : null}

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
            onBlur={salvarAoSair}
            placeholder="Assunto"
          />
          <label className="visually-hidden" htmlFor={`b-${c.id}`}>Mensagem</label>
          <textarea
            id={`b-${c.id}`}
            rows={12}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onBlur={salvarAoSair}
          />
          <p className="outSaved" aria-live="polite">
            {running === 'save'
              ? 'Salvando…'
              : dirty
                ? 'Por salvar — salva sozinho quando sair do campo.'
                : salvoEm
                  ? 'Alterações salvas.'
                  : ''}
          </p>

          {aTrocarPara ? (
            <div className="outTo">
              <label htmlFor={`to-${c.id}`}>Enviar para</label>
              <input
                id={`to-${c.id}`}
                type="email"
                inputMode="email"
                autoComplete="off"
                value={para}
                onChange={(e) => setPara(e.target.value)}
                placeholder="marketing@marca.com"
              />
              {opcoes.length ? (
                <div className="outToOpts">
                  <span className="osRowSub">Também encontrei:</span>
                  {opcoes.map((o) => (
                    <button key={o.address} type="button" onClick={() => setPara(o.address)}>
                      {o.address}
                      {o.team ? ` · ${o.team}` : ''}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="outToActs">
                <button
                  className="osPageBtn"
                  type="button"
                  disabled={pending || !para.includes('@')}
                  onClick={() =>
                    run('to', () => updateOutreachEmail(c.id, para), () => setATrocarPara(false))
                  }
                >
                  {running === 'to' ? <Spinner label="Verificando" /> : null}
                  Usar este
                </button>
                <button
                  className="osPageBtn"
                  type="button"
                  onClick={() => {
                    setPara(c.contact_email ?? '');
                    setATrocarPara(false);
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <p className="osRowSub">
              Para: {para || '—'}
              {avisoCaixa ? <span className="osTag" data-tone="watch">{avisoCaixa}</span> : null}{' '}
              <button className="outLink" type="button" onClick={() => setATrocarPara(true)}>
                trocar
              </button>
            </p>
          )}
        </div>
      </details>

      <footer className="osCardActs">
        {status === 'sent' ? (
          comprovativo ? (
            <span className="outSent" role="status">
              <b>Enviado.</b> De {comprovativo.from} para {comprovativo.to}.
            </span>
          ) : (
            <span className="osTag" data-tone="ok">
              enviado{c.sent_at ? ` ${formatDate(c.sent_at)}` : ''}
            </span>
          )
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
            <span className="osRowSub">Enviar para {para}?</span>
            <button
              className="osGo"
              type="button"
              disabled={pending}
              onClick={() => {
                setMsg('');
                start(async () => {
                  // O envio lê o assunto e o corpo da base. Uma edição por
                  // salvar saía com o texto antigo — salva-se primeiro, e se
                  // isso falhar não se envia nada.
                  const salvou = await salvarRascunho();
                  if (salvou.error) return;
                  setRunning('send');
                  const r = await sendOutreach(c.id);
                  setRunning('');
                  if (r.error) {
                    setMsg(r.error);
                    pushToast(`${c.name}: ${r.error}`, 'warn');
                    return;
                  }
                  setComprovativo({ from: r.from ?? '', to: r.to ?? para });
                  setStatus('sent');
                  setConfirming(false);
                  pushToast(`Enviado para ${r.to ?? para}.`);
                });
              }}
            >
              {running === 'send' ? <Spinner label="Enviando" /> : null}
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
              disabled={pending || !para}
              onClick={() => setConfirming(true)}
            >
              Enviar
            </button>
            {dirty ? (
              <button
                className="osPageBtn"
                type="button"
                disabled={pending}
                onClick={() => start(() => void salvarRascunho())}
              >
                {running === 'save' ? <Spinner label="Salvando" /> : null}
                Salvar
              </button>
            ) : (
              <button
                className="osPageBtn"
                type="button"
                disabled={pending || status === 'approved'}
                onClick={() => run('ok', () => approveOutreach(c.id), () => setStatus('approved'))}
              >
                {running === 'ok' ? <Spinner label="Aprovando" /> : null}
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
                <span className="osMoreLabel">mostrar de novo</span>
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

        {/* Ao pé do botão, não no topo do cartão: é aqui que ela está a olhar
            quando carrega. */}
        {msg ? (
          <p className="osWarn" role="alert">
            {msg}
          </p>
        ) : null}
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
  references = [],
}: {
  candidates: Candidate[];
  runDate: string | null;
  enabled: boolean;
  focus: Focus;
  manualRun: ManualRun | null;
  references?: BrandReferenceRow[];
}) {
  const refsPorMarca = new Map<string, BrandReferenceRow[]>();
  for (const r of references) {
    refsPorMarca.set(r.candidateId, [...(refsPorMarca.get(r.candidateId) ?? []), r]);
  }

  const [pending, start] = useTransition();
  const [running, setRunning] = useState('');
  const [msg, setMsg] = useState('');
  const [ask, setAsk] = useState(manualRun?.raw_query ?? '');
  const [pais, setPais] = useState(manualRun?.countries?.[0] ?? 'Portugal');
  // Um modo de cada vez, e não dois conjuntos de controlos na mesma tela: a
  // busca dirigida obedece ao que ela escreve, a automática ao foco salvo.
  const [modo, setModo] = useState<'manual' | 'auto'>('manual');

  const approved = candidates.filter((c) => c.status === 'approved').length;
  // As que já têm email escrito e passaram a revisão: são as únicas que a
  // revisão sequencial consegue despachar sem abrir mais nada.
  const prontas = candidates.filter((c) => sectionFor(c.status) === 'ready' && c.body);

  const run = (
    id: string,
    fn: () => Promise<{
      error?: string;
      sent?: number;
      failed?: number;
      firstError?: string;
      message?: string;
    }>,
  ) => {
    setRunning(id);
    start(async () => {
      const r = await fn();
      setRunning('');
      // «3 enviados» não diz o que aconteceu aos outros dois. Quando falha
      // alguma, a razão da primeira vem junto — foi o que faltou durante
      // semanas em que nenhuma abordagem saía.
      const lote =
        r.sent === undefined
          ? null
          : r.failed
            ? `${r.sent} enviados, ${r.failed} falharam${r.firstError ? `: ${r.firstError}` : '.'}`
            : `${r.sent} enviados.`;
      const texto = r.error ?? lote ?? r.message ?? '';
      setMsg(texto);
      if (texto) pushToast(texto, r.error || r.failed ? 'warn' : 'ok');
    });
  };

  return (
    <>
      <div className="dashBar">
        <h1>Prospeção</h1>
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
          A prospeção diária está desligada. Ligue em Definições para o CarolOS procurar marcas
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
                // resto da aplicação continua respondendo.
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
              {running === 'now' ? <Spinner label="Começando" /> : null}
              Procurar agora com este foco
            </button>
            {approved > 0 ? (
              <button
                className="osJob"
                type="button"
                disabled={pending}
                onClick={() => run('bulk', () => sendApprovedOutreach())}
              >
                {running === 'bulk' ? <Spinner label="Enviando" /> : null}
                Enviar os {approved} aprovados
              </button>
            ) : null}
            {/* As marcas pesquisadas antes de a escolha da caixa virar código
                ficaram em «suporte@» e «reservas@». Isto vai buscar o email de
                marketing dessas, e só dessas. */}
            <button
              className="osJob"
              type="button"
              disabled={pending}
              onClick={() => run('caixas', () => recheckOutreachEmails())}
            >
              {running === 'caixas' ? <Spinner label="Procurando" /> : null}
              Procurar o email de marketing das que estão na caixa errada
            </button>
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
                  pushToast(`Procurando «${ask.trim()}» em ${pais}. Aviso quando acabar.`);
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
                {running === 'ask' ? <Spinner label="Procurando" /> : null}
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
                  if (r.saved) pushToast(`${r.saved} salvas no histórico.`);
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

      {/* O caminho curto, antes das listas. Quem quer despachar o dia carrega
          aqui e nunca chega a ver a tabela. */}
      {prontas.length ? (
        <div className="osLead">
          <ReviewMode candidates={prontas} />
          <p className="osNote">
            {prontas.length === 1
              ? 'Uma marca com o email escrito e revisto. Falta o seu sim.'
              : `${prontas.length} marcas com o email escrito e revisto. Falta o seu sim.`}
          </p>
        </div>
      ) : null}

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
                <Card key={c.id} c={c} refs={refsPorMarca.get(c.id) ?? []} />
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
                {running === `clear-${section}` ? <Spinner label="Descartando" /> : null}
                Descartar as {rows.length} abaixo do corte
              </button>
            ) : null}
          </section>
        ))
      )}
    </>
  );
}
