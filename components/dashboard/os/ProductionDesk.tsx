'use client';

import { useState, useTransition } from 'react';
import {
  approve, askForMetrics, createCaseDraft, deliver, logFeedback, markBriefValidated,
  patchCollaboration, setCollaborationStatus, submitBrief,
} from '@/app/dashboard/carolos-actions';
import { formatDate } from '@/lib/time';
import { label } from '@/lib/labels';
import type { BriefRow } from '@/modules/briefs/service';
import type { Closeout } from '@/modules/cases/service';
import { COLLABORATION_STATUS, STATUS_LABEL, type CollaborationRow, type CollaborationStatus } from '@/modules/production/domain';

/** A bancada de produção. Logística, briefing, entregas, revisões e o
 *  encerramento — que é a parte que costuma ficar por fazer. */

type Deliverable = {
  id: string;
  version: number;
  asset_url: string;
  delivered_at: string | null;
  recipient: string;
  channel: string;
  feedback: string;
  feedback_class: string | null;
  approval_status: string;
};

export default function ProductionDesk({
  collaboration, briefs, deliverables, closeout,
}: {
  collaboration: CollaborationRow;
  briefs: BriefRow[];
  deliverables: Deliverable[];
  closeout: Closeout;
}) {
  const [, start] = useTransition();
  const [error, setError] = useState('');
  const c = collaboration;

  const patch = (values: Record<string, unknown>) =>
    start(async () => {
      setError('');
      const result = await patchCollaboration(c.id, values);
      if (result.error) setError(result.error);
    });

  return (
    <>
      {c.gateBlockers.length ? (
        <p className="osWarn">
          Antes de gravar: {c.gateBlockers.join(' ')}
        </p>
      ) : (
        <p className="osWarn" data-tone="ok">Nada por resolver. Pode gravar.</p>
      )}

      {error ? <p className="osWarn" role="alert">{error}</p> : null}

      <div className="osPanel">
        <h3>Estado e logística</h3>
        <div className="osGrid">
          <div>
            <label className="osField">
              <span>Estado</span>
              <select
                value={c.status}
                onChange={(e) => start(() => setCollaborationStatus(c.id, e.target.value).then(() => undefined))}
              >
                {COLLABORATION_STATUS.map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s as CollaborationStatus]}</option>
                ))}
              </select>
            </label>

            <label className="osField">
              <span>Modelo de compensação</span>
              <select
                value={c.compensationModel}
                onChange={(e) => patch({ compensationModel: e.target.value })}
              >
                <option value="unclear">Por definir</option>
                <option value="paid">Pago</option>
                <option value="barter">Permuta</option>
                <option value="reimbursement">Reembolso</option>
                <option value="hybrid">Misto</option>
                <option value="unpaid">Sem pagamento</option>
              </select>
            </label>

            <label className="osField">
              <span>Prazo de entrega</span>
              <input
                type="date"
                defaultValue={c.deadlineAt ?? ''}
                onBlur={(e) => patch({ deadlineAt: e.target.value || null })}
              />
            </label>

            <label className="osField">
              <span>Regra de pagamento</span>
              <select value={c.paymentGate} onChange={(e) => patch({ paymentGate: e.target.value })}>
                <option value="unresolved">Por decidir</option>
                <option value="none">Sem sinal</option>
                <option value="deposit">Sinal à cabeça</option>
                <option value="full_upfront">100% antes</option>
                <option value="on_delivery">Na entrega</option>
              </select>
            </label>

            <label className="osField">
              <span>Revisões incluídas</span>
              <input
                type="number"
                min={0}
                defaultValue={c.revisionsIncluded ?? ''}
                onBlur={(e) => patch({ revisionsIncluded: e.target.value === '' ? null : Number(e.target.value) })}
              />
            </label>
          </div>

          <div>
            <label className="osField">
              <span>Como chega o produto</span>
              <select
                value={c.logisticsKind ?? ''}
                onChange={(e) => patch({ logisticsKind: e.target.value || null })}
              >
                <option value="">Por definir</option>
                <option value="physical">Envio físico</option>
                <option value="digital">Acesso digital</option>
                <option value="none">Não se aplica</option>
              </select>
            </label>

            {c.logisticsKind === 'physical' ? (
              <>
                <label className="osField">
                  <span>Enviado a</span>
                  <input type="date" defaultValue={c.shippedAt ?? ''} onBlur={(e) => patch({ shippedAt: e.target.value || null })} />
                </label>
                <label className="osField">
                  <span>Recebido a</span>
                  <input type="date" defaultValue={c.receivedAt ?? ''} onBlur={(e) => patch({ receivedAt: e.target.value || null })} />
                </label>
                <label className="osField">
                  <span>Referência de envio</span>
                  <input type="text" defaultValue={c.trackingRef ?? ''} onBlur={(e) => patch({ trackingRef: e.target.value || null })} />
                </label>
              </>
            ) : null}

            {c.logisticsKind === 'digital' ? (
              <>
                <label className="osField">
                  <span>Acesso</span>
                  <select value={c.accessStatus ?? ''} onChange={(e) => patch({ accessStatus: e.target.value || null })}>
                    <option value="">Por definir</option>
                    <option value="required">É preciso acesso</option>
                    <option value="requested">Pedido</option>
                    <option value="granted">Concedido</option>
                    <option value="ready">Pronto a usar</option>
                  </select>
                </label>
                <p className="osRowSub">
                  Nunca escreva senhas aqui. Peça um convite ou uma conta temporária.
                </p>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <BriefPanel collaborationId={c.id} briefs={briefs} />
      <DeliveryPanel collaborationId={c.id} deliverables={deliverables} />
      <ClosePanel collaborationId={c.id} closeout={closeout} />
    </>
  );
}

function BriefPanel({ collaborationId, briefs }: { collaborationId: string; briefs: BriefRow[] }) {
  const [pending, start] = useTransition();
  const [raw, setRaw] = useState('');
  const [error, setError] = useState('');
  const latest = briefs[0];

  return (
    <div className="osPanel">
      <h3>Briefing</h3>

      {latest ? (
        <>
          <div className="osCardTop">
            <span className="osTag" data-tone={latest.status === 'validated' ? 'ok' : latest.gaps.length ? 'bad' : 'hot'}>
              {label('briefStatus', latest.status)}
            </span>
            <span className="osTag" data-tone="mute">v{latest.version}</span>
          </div>

          {latest.gaps.length ? (
            <>
              <p className="osRowSub" style={{ marginTop: 12 }}>Falta no briefing</p>
              <ul className="osList" data-tone="bad">
                {latest.gaps.map((g) => <li key={g}>{g}</li>)}
              </ul>
            </>
          ) : (
            <p className="osRowSub">Nenhuma lacuna crítica.</p>
          )}

          {latest.questions.length ? (
            <>
              <p className="osRowSub" style={{ marginTop: 12 }}>Perguntar à marca</p>
              <ul className="osList">
                {latest.questions.map((q) => <li key={q}>{q}</li>)}
              </ul>
              <div className="osActs">
                <button
                  className="chip"
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(latest.questions.join('\n'))}
                >
                  Copiar perguntas
                </button>
              </div>
            </>
          ) : null}

          {latest.riskFlags.length ? (
            <>
              <p className="osRowSub" style={{ marginTop: 12 }}>A rever antes de gravar</p>
              <ul className="osList" data-tone="bad">
                {latest.riskFlags.map((f, i) => <li key={`${f.code}-${i}`}>{f.note}</li>)}
              </ul>
            </>
          ) : null}

          {latest.status !== 'validated' ? (
            <div className="osActs">
              <button
                className="btn"
                type="button"
                disabled={pending}
                onClick={() => start(() => markBriefValidated(latest.id, collaborationId).then(() => undefined))}
              >
                Resolvi tudo com a marca
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      <details className="osEvidence" style={{ marginTop: 16 }}>
        <summary>{latest ? 'Colar uma versão nova' : 'Colar o briefing'}</summary>
        <label className="osField" style={{ marginTop: 12 }}>
          <span>Cole o e-mail, o documento ou a mensagem</span>
          <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={10} />
        </label>
        <div className="osActs">
          <button
            className="btn"
            type="button"
            disabled={pending || !raw.trim()}
            onClick={() =>
              start(async () => {
                setError('');
                const result = await submitBrief(collaborationId, raw);
                if (result.error) return setError(result.error);
                setRaw('');
              })
            }
          >
            {pending ? 'A ler…' : 'Ler briefing'}
          </button>
        </div>
        {error ? <p className="osWarn" role="alert">{error}</p> : null}
      </details>
    </div>
  );
}

function DeliveryPanel({
  collaborationId, deliverables,
}: {
  collaborationId: string;
  deliverables: Deliverable[];
}) {
  const [pending, start] = useTransition();
  const [url, setUrl] = useState('');
  const [recipient, setRecipient] = useState('');
  const [error, setError] = useState('');

  return (
    <div className="osPanel">
      <h3>Entregas e revisões</h3>

      {deliverables.length ? (
        <div className="osRows">
          {deliverables.map((d) => (
            <div className="osRow" key={d.id}>
              <div>
                <span className="osRowName" style={{ fontSize: 17 }}>Versão {d.version}</span>
                <p className="osRowSub">
                  {d.delivered_at ? formatDate(d.delivered_at) : '—'} · {d.recipient || 'destinatário não indicado'}
                  {d.feedback ? ` · ${d.feedback.slice(0, 120)}` : ''}
                </p>
                {d.feedback_class && d.feedback_class !== 'in_scope' ? (
                  <p className="osRowSub">
                    Esta revisão está fora do escopo ({label('feedbackClass', d.feedback_class)}):
                    é uma negociação nova,
                    não uma correção incluída.
                  </p>
                ) : null}
              </div>
              <div className="osRowSide">
                <span className="osTag" data-tone={d.approval_status === 'approved' ? 'won' : 'mute'}>
                  {label('approval', d.approval_status)}
                </span>
                {d.approval_status !== 'approved' ? (
                  <>
                    <FeedbackForm deliverableId={d.id} collaborationId={collaborationId} />
                    <button
                      className="chip"
                      type="button"
                      disabled={pending}
                      onClick={() => start(() => approve(d.id, collaborationId).then(() => undefined))}
                    >
                      Aprovado
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="osRowSub">Ainda não há entregas registadas.</p>
      )}

      <div className="osInline" style={{ marginTop: 16 }}>
        <label className="osField">
          <span>Ligação do arquivo</span>
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>
        <label className="osField">
          <span>Para quem</span>
          <input type="text" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
        </label>
        <button
          className="btn"
          type="button"
          disabled={pending || !url.trim()}
          onClick={() =>
            start(async () => {
              setError('');
              const result = await deliver(collaborationId, url, recipient, 'email');
              if (result.error) return setError(result.error);
              setUrl('');
            })
          }
        >
          Registar entrega
        </button>
      </div>
      {error ? <p className="osWarn" role="alert">{error}</p> : null}
    </div>
  );
}

function FeedbackForm({ deliverableId, collaborationId }: { deliverableId: string; collaborationId: string }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [kind, setKind] = useState<'in_scope' | 'subjective' | 'brief_change' | 'new_deliverable'>('in_scope');

  if (!open) {
    return (
      <button className="chip" type="button" onClick={() => setOpen(true)}>
        Pediram revisão
      </button>
    );
  }

  return (
    <div className="osInline">
      <label className="osField">
        <span>O que pediram</span>
        <input type="text" value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <label className="osField">
        <span>Está no escopo?</span>
        <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="in_scope">Sim, correção incluída</option>
          <option value="subjective">Revisão subjectiva</option>
          <option value="brief_change">Mudaram o briefing</option>
          <option value="new_deliverable">É um trabalho novo</option>
        </select>
      </label>
      <button
        className="btn"
        type="button"
        disabled={pending || !text.trim()}
        onClick={() =>
          start(async () => {
            await logFeedback(deliverableId, collaborationId, text, kind);
            setOpen(false);
            setText('');
          })
        }
      >
        Registar
      </button>
    </div>
  );
}

/** O encerramento. Um projeto não acaba na entrega: acaba quando estas seis
 *  caixas estiverem respondidas, mesmo que a resposta seja «não se aplica». */
function ClosePanel({ collaborationId, closeout }: { collaborationId: string; closeout: Closeout }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');

  const items: [keyof Closeout, string][] = [
    ['approved', 'Entrega aprovada'],
    ['paymentResolved', 'Pagamento resolvido'],
    ['rightsRegistered', 'Direitos registados'],
    ['portfolioPermission', 'Permissão de portfólio decidida'],
    ['feedbackOrMetrics', 'Feedback ou métricas recebidos'],
    ['upsellEvaluated', 'Próxima oferta avaliada'],
  ];

  return (
    <div className="osPanel">
      <h3>Encerramento</h3>
      <p className="osNote">
        Enquanto isto não estiver todo respondido, o trabalho não virou prova comercial nem abriu a
        porta ao seguinte.
      </p>

      <div className="osRows">
        {items.map(([key, label]) => (
          <div className="osRow" key={key}>
            <div><span className="osRowName" style={{ fontSize: 16 }}>{label}</span></div>
            <div className="osRowSide">
              <span className="osTag" data-tone={closeout[key] ? 'ok' : 'bad'}>
                {closeout[key] ? 'feito' : 'falta'}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="osActs">
        <button
          className="btn"
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await askForMetrics(collaborationId);
              setMessage('Pedido de métricas registado na linha do tempo.');
            })
          }
        >
          Registar pedido de métricas
        </button>
        <button
          className="chip"
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const result = await createCaseDraft(collaborationId);
              setMessage(result.error ?? 'Rascunho de case criado. Está em Cases.');
            })
          }
        >
          Criar rascunho do case
        </button>
      </div>

      {message ? <p className="osWarn" data-tone="ok">{message}</p> : null}
    </div>
  );
}
