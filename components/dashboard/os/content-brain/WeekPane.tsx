'use client';

import { useState, useTransition } from 'react';
import Spinner from '@/components/dashboard/Spinner';
import {
  adjustThis,
  approveThis,
  buildThisWeek,
  dropThis,
  prepareMaterial,
  swapThis,
} from '@/app/dashboard/content-strategy-actions';
import {
  FORMATS,
  FORMAT_LABEL,
  LENSES,
  LENS_LABEL,
  OBJECTIVES,
  OBJECTIVE_LABEL,
  type Format,
  type Lens,
  type Objective,
} from '@/modules/content-brain/editorial';
import type { AdjustableField } from '@/modules/content-brain/week-service';

/** A Semana: a casa do Conteúdo.
 *
 *  Abre no que há para decidir agora, nunca num calendário vazio nem num
 *  painel de gráficos. A ordem é a que reduz decisões: o resumo da semana, as
 *  poucas propostas, o que espera por ela, o que já está pronto, e o que
 *  aprendemos — no máximo duas coisas, e só as que mudam a próxima escolha. */

export type Evidence = { kind: string; detail: string; refId?: string };

export type Proposal = {
  id: string;
  topicLabel: string;
  pillarLabel: string;
  angle: string;
  lens: Lens;
  lensLabel: string;
  objective: Objective;
  objectiveLabel: string;
  format: Format;
  formatLabel: string;
  structureLabel: string | null;
  modalityLabel: string | null;
  whyNow: string;
  evidence: Evidence[];
  status: string;
  statusLabel: string;
  statusMeans: string;
  packId: string | null;
  packGaps: string[];
  reelTest: boolean;
};

export type WeekData = {
  weekStart: string;
  capacity: number;
  summary: string;
  proposals: Proposal[];
  needsYou: Proposal[];
  readyToProduce: Proposal[];
  exists: boolean;
};

export default function WeekPane({
  week,
  learnings,
  stock,
}: {
  week: WeekData;
  /** No máximo dois. Se não mudam a próxima decisão, não entram. */
  learnings: { id: string; statement: string; level: string; because: string }[];
  stock: { ready: number; target: number };
}) {
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  if (!week.exists) {
    return (
      <section className="osSection">
        <h2>A semana ainda não foi montada</h2>
        <p className="osNote">
          O CarolOS olha o mapa, o que você publicou, o que aconteceu e o que aprendemos, e propõe
          poucas coisas. Você aprova, ajusta ou troca.
        </p>
        <button
          className="osStart"
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await buildThisWeek();
              if ('error' in r) setErro(r.error);
            })
          }
        >
          Montar a semana
        </button>
        {pending ? <Spinner /> : null}
        {erro ? <p className="osWarn">{erro}</p> : null}
      </section>
    );
  }

  return (
    <>
      <section className="osSection cbWeek">
        <h2>Esta semana</h2>
        <p className="cbWeekSummary">{week.summary}</p>
        <p className="osNote">
          {week.capacity} {week.capacity === 1 ? 'post' : 'posts'} é a sua capacidade. Mais é bônus,
          e não há alerta por não passar disso.
        </p>
      </section>

      <section className="osSection">
        <h2>Propostas</h2>
        <div className="cbProposals">
          {week.proposals.map((p) => (
            <ProposalCard key={p.id} p={p} />
          ))}
        </div>
        {week.proposals.length === 0 ? (
          <p className="osEmpty">Nenhuma proposta viva nesta semana.</p>
        ) : null}
      </section>

      {week.needsYou.length ? (
        <section className="osSection">
          <h2>Precisa de você</h2>
          <p className="osNote">Só o que está mesmo parado à sua espera.</p>
          <div className="osRows">
            {week.needsYou.map((p) => (
              <div className="osRow" key={p.id}>
                <div>
                  <span className="osRowName">{p.topicLabel}</span>
                  <p className="osRowSub">{p.statusMeans}</p>
                </div>
                <div className="osRowSide">
                  <span className="osTag" data-tone="mute">{p.statusLabel}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="osSection">
        <h2>Pronto para produzir</h2>
        <p className="osNote">
          {stock.ready} de {stock.target}. O estoque é pequeno de propósito: uma fila grande vira
          dívida.
        </p>
        {week.readyToProduce.length ? (
          <div className="osRows">
            {week.readyToProduce.map((p) => (
              <div className="osRow" key={p.id}>
                <div>
                  <span className="osRowName">{p.topicLabel}</span>
                  <p className="osRowSub">{p.angle}</p>
                </div>
                <div className="osRowSide">
                  <span className="osTag" data-tone="won">{p.formatLabel}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="osEmpty">Nada validado ainda.</p>
        )}
      </section>

      {learnings.length ? (
        <section className="osSection">
          <h2>Aprendemos</h2>
          <div className="osRows">
            {learnings.slice(0, 2).map((l) => (
              <div className="osRow" key={l.id}>
                <div>
                  <span className="osRowName">{l.statement}</span>
                  <p className="osRowSub">{l.because}</p>
                </div>
                <div className="osRowSide">
                  <span className="osTag" data-tone="mute">{l.level}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

/** Um cartão curto. Antes da aprovação não existe roteiro, e por isso não há
 *  nada aqui que pareça um. */
function ProposalCard({ p }: { p: Proposal }) {
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ajustar, setAjustar] = useState<AdjustableField | null>(null);
  const [verPorque, setVerPorque] = useState(false);

  const run = (fn: () => Promise<{ ok: true } | { error: string }>) =>
    start(async () => {
      setErro(null);
      const r = await fn();
      if ('error' in r) setErro(r.error);
    });

  return (
    <article className="cbProposal">
      <header>
        <span className="osTag" data-tone="mute">{p.pillarLabel}</span>
        <span className="osTag" data-tone="mute">{p.objectiveLabel}</span>
        <span className="osTag" data-tone="mute">{p.formatLabel}</span>
        {p.modalityLabel ? <span className="osTag">{p.modalityLabel}</span> : null}
        {p.reelTest ? <span className="osTag" data-tone="won">Reel Test recomendado</span> : null}
      </header>

      <h3>{p.topicLabel}</h3>
      <p className="cbAngle">{p.angle}</p>

      <p className="cbWhy">
        <b>Por que agora</b> {p.whyNow}
      </p>

      {p.evidence.length ? (
        <>
          <button className="focusSkip" type="button" onClick={() => setVerPorque((v) => !v)}>
            {verPorque ? 'Esconder de onde veio' : 'De onde veio'}
          </button>
          {verPorque ? (
            <ul className="cbEvidence">
              {p.evidence.map((e, i) => (
                <li key={`${e.kind}-${i}`}>{e.detail}</li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}

      <p className="osNote">
        {p.lensLabel}
        {p.structureLabel ? ` · ${p.structureLabel}` : ''}
      </p>

      {p.status === 'proposed' ? (
        <div className="cbActs">
          <button className="osStart" type="button" disabled={pending} onClick={() => run(() => approveThis(p.id))}>
            Aprovar
          </button>
          <button className="chip" type="button" disabled={pending} onClick={() => setAjustar((a) => (a ? null : 'objective'))}>
            Quero ajustar
          </button>
          <button
            className="focusSkip"
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await swapThis(p.id);
                if ('error' in r) setErro(r.error);
                else if (!r.replaced) setAviso('Não encontrei outra proposta com razão para entrar agora.');
              })
            }
          >
            Trocar
          </button>
        </div>
      ) : null}

      {p.status === 'approved_to_develop' ? (
        <div className="cbActs">
          <button
            className="osStart"
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await prepareMaterial(p.id);
                if ('error' in r) setErro(r.error);
                else if (r.needsStory) setAviso('Para escrever isso preciso do que aconteceu de verdade. Conte em Produção.');
              })
            }
          >
            Preparar o material
          </button>
        </div>
      ) : null}

      {p.status !== 'proposed' && p.status !== 'approved_to_develop' ? (
        <p className="osNote">{p.statusMeans}</p>
      ) : null}

      {ajustar ? <Adjust proposal={p} field={ajustar} onField={setAjustar} onDone={() => setAjustar(null)} /> : null}

      {pending ? <Spinner /> : null}
      {aviso ? <p className="osNote">{aviso}</p> : null}
      {erro ? <p className="osWarn">{erro}</p> : null}

      {p.status === 'proposed' ? (
        <button className="focusSkip" type="button" disabled={pending} onClick={() => run(() => dropThis(p.id))}>
          Fora desta semana
        </button>
      ) : null}
    </article>
  );
}

/** Ajuste focado numa decisão. Não reabre a proposta inteira: ela já escolheu
 *  o que quer mudar, e o resto continua de pé. */
function Adjust({
  proposal,
  field,
  onField,
  onDone,
}: {
  proposal: Proposal;
  field: AdjustableField;
  onField: (f: AdjustableField) => void;
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [angulo, setAngulo] = useState(proposal.angle);

  const save = (value: string) =>
    start(async () => {
      const r = await adjustThis(proposal.id, field, value);
      if ('error' in r) setErro(r.error);
      else onDone();
    });

  const opcoes: { id: AdjustableField; label: string }[] = [
    { id: 'objective', label: 'Objetivo' },
    { id: 'format', label: 'Formato' },
    { id: 'lens', label: 'Lente' },
    { id: 'angle', label: 'Ângulo' },
  ];

  return (
    <div className="cbAdjust">
      <div className="cbAdjustTabs">
        {opcoes.map((o) => (
          <button
            key={o.id}
            type="button"
            className="chip"
            data-on={field === o.id || undefined}
            onClick={() => onField(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>

      {field === 'objective' ? (
        <div className="cbActs">
          {OBJECTIVES.map((o) => (
            <button key={o} className="chip" type="button" disabled={pending} onClick={() => save(o)}>
              {OBJECTIVE_LABEL[o]}
            </button>
          ))}
        </div>
      ) : null}

      {field === 'format' ? (
        <div className="cbActs">
          {FORMATS.map((f) => (
            <button key={f} className="chip" type="button" disabled={pending} onClick={() => save(f)}>
              {FORMAT_LABEL[f]}
            </button>
          ))}
        </div>
      ) : null}

      {field === 'lens' ? (
        <div className="cbActs">
          {LENSES.map((l) => (
            <button key={l} className="chip" type="button" disabled={pending} onClick={() => save(l)}>
              {LENS_LABEL[l]}
            </button>
          ))}
        </div>
      ) : null}

      {field === 'angle' ? (
        <div className="cbAdjustAngle">
          <label htmlFor={`angle-${proposal.id}`}>O ângulo, com as suas palavras</label>
          <textarea
            id={`angle-${proposal.id}`}
            rows={3}
            value={angulo}
            onChange={(e) => setAngulo(e.target.value)}
          />
          <button className="osStart" type="button" disabled={pending} onClick={() => save(angulo)}>
            Salvar
          </button>
        </div>
      ) : null}

      {pending ? <Spinner /> : null}
      {erro ? <p className="osWarn">{erro}</p> : null}
    </div>
  );
}
