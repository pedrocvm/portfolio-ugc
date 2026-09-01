'use client';

import { useState, useTransition } from 'react';
import {
  decideOnRecommendation, draftMessage, logConcession, pushDraftToGmail, runCopilot,
} from '@/app/dashboard/carolos-actions';
import type { NegotiationAnalysis } from '@/modules/ai/schemas';
import { label } from '@/lib/labels';

/** Copiloto comercial. Recomendação primeiro, texto depois — e nunca envio.
 *
 *  O botão que existe é «criar rascunho no Gmail»: a mensagem fica escrita na
 *  caixa dela, e enviar continua a ser um clique dela. Não há aqui nenhum
 *  caminho que ponha uma decisão comercial na rua sozinha. */

const RECOMMENDATION_LABEL: Record<string, string> = {
  ACCEPT: 'Aceitar',
  NEGOTIATE: 'Negociar',
  ASK: 'Perguntar antes',
  DECLINE: 'Recusar',
  NURTURE: 'Deixar em nurture',
};

const GOALS = [
  'Responder ao pedido de valor sem fechar preço antes de saber o escopo',
  'Perguntar período e canais do uso pago',
  'Enviar portfólio e o exemplo mais relevante',
  'Reenquadrar: a proposta é UGC, não influencer',
  'Fazer follow-up com contexto novo',
];

export default function Copilot({
  opportunityId,
  aiEnabled,
  gmailDraftEnabled,
}: {
  opportunityId: string;
  aiEnabled: boolean;
  gmailDraftEnabled: boolean;
}) {
  const [pending, start] = useTransition();
  const [analysis, setAnalysis] = useState<NegotiationAnalysis | null>(null);
  const [recommendationId, setRecommendationId] = useState<string | null>(null);
  const [goal, setGoal] = useState(GOALS[0]);
  const [text, setText] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const analyse = () =>
    start(async () => {
      setError('');
      const result = await runCopilot(opportunityId);
      if (result.error) return setError(result.error);
      setAnalysis(result.analysis as NegotiationAnalysis);
      setRecommendationId(result.recommendationId ?? null);
    });

  const write = () =>
    start(async () => {
      setError('');
      const result = await draftMessage(opportunityId, goal);
      if (result.error) return setError(result.error);
      setText(result.draftText ?? '');
    });

  const toGmail = () =>
    start(async () => {
      setError('');
      setMessage('');
      const result = await pushDraftToGmail(opportunityId, subject || 'Sobre a nossa conversa', text);
      if (result.error) return setError(result.error);
      setMessage('Rascunho criado no Gmail. Leia, ajuste e envie de lá.');
      if (recommendationId) await decideOnRecommendation(recommendationId, 'accepted');
    });

  if (!aiEnabled) {
    return (
      <div className="osPanel">
        <h3>Copiloto comercial</h3>
        <p className="osNote">
          A camada de IA está desligada. Liga <b>Camada de IA</b> e <b>Rascunhos de resposta</b> em
          Definições para o copiloto ler a negociação e preparar a resposta.
        </p>
      </div>
    );
  }

  return (
    <div className="osPanel">
      <h3>Copiloto comercial</h3>
      <p className="osNote">
        Leia a negociação toda, diz o que fazer e porquê, e só depois escreve. Preço e direitos vêm do
        motor determinístico — o modelo escolhe as palavras, não os números.
      </p>

      <div className="osActs">
        <button className="btn" type="button" disabled={pending} onClick={analyse}>
          {pending ? 'A ler…' : 'Analisar a negociação'}
        </button>
      </div>

      {error ? <p className="osWarn" role="alert">{error}</p> : null}
      {message ? <p className="osWarn" data-tone="ok">{message}</p> : null}

      {analysis ? (
        <>
          <div className="osCardTop" style={{ marginTop: 18 }}>
            <span className="osTag" data-tone="hot">
              {RECOMMENDATION_LABEL[analysis.recommendation] ?? analysis.recommendation}
            </span>
            <span className="osTag" data-tone="mute">
              confiança {Math.round(analysis.confidence * 100)}%
            </span>
            <span className="osTag" data-tone="mute">{analysis.offer_classification}</span>
          </div>

          <p className="osWhy" style={{ marginTop: 10 }}>{analysis.reasoning}</p>

          {analysis.risks.length ? (
            <>
              <p className="osRowSub" style={{ marginTop: 16 }}>Riscos detectados</p>
              <ul className="osList" data-tone="bad">
                {analysis.risks.map((r) => (
                  <li key={r.code}>
                    <b>risco {label('severity', r.severity)}</b> — {r.note}
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {analysis.missing_information.length ? (
            <>
              <p className="osRowSub" style={{ marginTop: 16 }}>Falta saber</p>
              <ul className="osList">
                {analysis.missing_information.map((m) => <li key={m}>{m}</li>)}
              </ul>
            </>
          ) : null}

          {analysis.dangerous_concessions.length ? (
            <>
              <p className="osRowSub" style={{ marginTop: 16 }}>Não ceder</p>
              <ul className="osList" data-tone="bad">
                {analysis.dangerous_concessions.map((c) => <li key={c}>{c}</li>)}
              </ul>
            </>
          ) : null}

          {analysis.safe_concessions.length ? (
            <>
              <p className="osRowSub" style={{ marginTop: 16 }}>Pode ceder, se destravar</p>
              <ul className="osList" data-tone="ok">
                {analysis.safe_concessions.map((c) => <li key={c}>{c}</li>)}
              </ul>
            </>
          ) : null}

          {recommendationId ? (
            <div className="osActs">
              <button
                className="chip"
                type="button"
                disabled={pending}
                onClick={() => start(() => decideOnRecommendation(recommendationId, 'rejected').then(() => undefined))}
              >
                Não concordo
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      <label className="osField" style={{ marginTop: 22 }}>
        <span>Objetivo desta mensagem</span>
        <select value={goal} onChange={(e) => setGoal(e.target.value)}>
          {GOALS.map((g) => <option key={g}>{g}</option>)}
          {analysis?.suggested_reply ? <option value={analysis.summary}>{analysis.summary}</option> : null}
        </select>
      </label>

      <div className="osActs">
        <button className="btn" type="button" disabled={pending} onClick={write}>
          {pending ? 'A escrever…' : 'Escrever rascunho'}
        </button>
      </div>

      {text ? (
        <>
          <label className="osField" style={{ marginTop: 18 }}>
            <span>Assunto</span>
            <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Sobre a nossa conversa" />
          </label>
          <label className="osField">
            <span>Rascunho — lê e corrige antes de sair daqui</span>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={12} />
          </label>
          <div className="osActs">
            {gmailDraftEnabled ? (
              <button className="btn" type="button" disabled={pending} onClick={toGmail}>
                Criar rascunho no Gmail
              </button>
            ) : (
              <span className="osRowSub">
                Ligue «Criar rascunho no Gmail» em Definições para isto ir direito à sua caixa.
                Até lá, copie daqui.
              </span>
            )}
            <button
              className="chip"
              type="button"
              onClick={() => navigator.clipboard?.writeText(text)}
            >
              Copiar
            </button>
          </div>
        </>
      ) : null}

      <ConcessionLog opportunityId={opportunityId} />
    </div>
  );
}

/** Toda a concessão fica registada. Sem isto, a ronda seguinte não sabe o que
 *  já foi dado e a negociação escorrega sozinha. */
function ConcessionLog({ opportunityId }: { opportunityId: string }) {
  const [pending, start] = useTransition();
  const [what, setWhat] = useState('');
  const [forWhat, setForWhat] = useState('');
  const [done, setDone] = useState(false);

  return (
    <details className="osEvidence" style={{ marginTop: 20 }}>
      <summary>Registar uma concessão</summary>
      <div className="osInline" style={{ marginTop: 12 }}>
        <label className="osField">
          <span>O que cedeste</span>
          <input type="text" value={what} onChange={(e) => setWhat(e.target.value)} />
        </label>
        <label className="osField">
          <span>Em troca de</span>
          <input type="text" value={forWhat} onChange={(e) => setForWhat(e.target.value)} />
        </label>
        <button
          className="btn"
          type="button"
          disabled={pending || !what.trim()}
          onClick={() =>
            start(async () => {
              await logConcession(opportunityId, what, forWhat);
              setWhat('');
              setForWhat('');
              setDone(true);
            })
          }
        >
          Registar
        </button>
      </div>
      {done ? <p className="osRowSub">Registado na linha do tempo.</p> : null}
    </details>
  );
}
