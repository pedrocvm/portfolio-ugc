'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import {
  approveOutreach, discoverNow, draftOutreach, sendApprovedOutreach, sendOutreach, skipOutreach,
  suppressBrand, updateOutreachDraft,
} from '@/app/dashboard/outreach-actions';
import Spinner from '@/components/dashboard/Spinner';
import { formatDate } from '@/lib/time';
import { CONF_LABEL, PAID_LABEL, UGC_LABEL } from '@/modules/outreach/history';
import { LIMITS } from '@/modules/outreach/domain';

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
  quality: { pass: boolean; score: number; failures: string[] } | null;
  status: string; sent_at: string | null;
};

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
    <article className="osCard" data-risk={c.red_flags.length ? 'medium' : 'none'}>
      <header className="osCardTop">
        <span className="osBrand">{c.name}</span>
        <div className="osCardFlags">
          {c.fit_score ? (
            <span className="osTag" data-tone={c.fit_score >= LIMITS.minFitScore ? 'hot' : 'mute'}>
              encaixe {c.fit_score}
            </span>
          ) : null}
          {c.paid_media_signal ? (
            <span className="osTag" data-tone={c.paid_media_signal === 'strong' ? 'ok' : 'mute'}>
              {PAID_LABEL[c.paid_media_signal]}
            </span>
          ) : null}
        </div>
      </header>

      <h3>{c.product ? `${c.product}` : c.name}</h3>
      <p className="osWhy">{c.why_fit}</p>

      <div className="osMeta">
        {c.country ? <span>{c.country}</span> : null}
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
    </article>
  );
}

export default function Outreach({
  candidates,
  runDate,
  enabled,
}: {
  candidates: Candidate[];
  runDate: string | null;
  enabled: boolean;
}) {
  const [pending, start] = useTransition();
  const [running, setRunning] = useState('');
  const [msg, setMsg] = useState('');
  const [ask, setAsk] = useState('');

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

      {!enabled ? (
        <p className="osWarn" data-tone="info">
          A prospecção diária está desligada. Ligue em Definições para o CarolOS procurar marcas
          novas todas as manhãs — nunca envia nada sozinho.
        </p>
      ) : null}

      <div className="osJobs">
        <button
          className="osJob"
          data-primary=""
          type="button"
          disabled={pending}
          onClick={() => run('now', () => discoverNow())}
        >
          {running === 'now' ? <Spinner label="A procurar" /> : null}
          Procurar marcas agora
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

      <form
        className="osSearch"
        onSubmit={(e) => {
          e.preventDefault();
          if (ask.trim()) run('ask', () => discoverNow(ask.trim()));
        }}
      >
        <input
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          placeholder="Ou peça uma busca: «SaaS portugueses», «robôs aspiradores»…"
          aria-label="Busca dirigida"
        />
        <button type="submit" disabled={pending || !ask.trim()}>
          {running === 'ask' ? <Spinner label="Procurando" /> : null}
          Procurar
        </button>
      </form>

      {msg ? <p className="osWarn" data-tone="info">{msg}</p> : null}

      {candidates.length === 0 ? (
        <p className="osEmpty">
          Nenhuma marca nova atingiu o nível de qualidade hoje. É melhor assim do que encher a
          lista com o que não presta.
        </p>
      ) : (
        <div className="osQueue" data-air="" style={{ marginTop: 22 }}>
          {candidates.map((c) => (
            <Card key={c.id} c={c} />
          ))}
        </div>
      )}
    </>
  );
}
