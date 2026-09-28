'use client';

import { useState, useTransition } from 'react';
import Spinner from '@/components/dashboard/Spinner';
import { finishSession, groupSession, moveProposal } from '@/app/dashboard/content-strategy-actions';
import PackView, { type PackData } from './PackView';

/** Produção: o que está pronto e o que falta executar.
 *
 *  Duas perguntas, por esta ordem: o que precisa da leitura dela, e o que dá
 *  para gravar de uma vez só. O Modo Sessão não é uma agenda — é a lista que
 *  evita montar a luz três vezes na mesma semana. */

export type ProductionItem = {
  proposalId: string;
  title: string;
  angle: string;
  status: string;
  statusLabel: string;
  formatLabel: string;
  pack: PackData | null;
};

export type SessionGroupView = {
  key: string;
  label: string;
  shared: string[];
  needsOuting: boolean;
  checklist: string[];
  items: { proposalId: string; title: string }[];
};

export default function ProductionPane({
  toValidate,
  ready,
  inProduction,
  groups,
  savedSessions,
  templates,
  stock,
}: {
  toValidate: ProductionItem[];
  ready: ProductionItem[];
  inProduction: ProductionItem[];
  groups: SessionGroupView[];
  savedSessions: { id: string; label: string; checklist: string[]; needsOuting: boolean }[];
  templates: { key: string; label: string; pendingTokens: string[] }[];
  stock: { ready: number; target: number };
}) {
  return (
    <>
      <section className="osSection">
        <h2>Para validar</h2>
        <p className="osNote">
          O material chega preparado, mas não chega pronto. Nada passa daqui sem você ler.
        </p>
        {toValidate.length ? (
          toValidate.map((i) =>
            i.pack ? (
              <PackView key={i.proposalId} pack={i.pack} title={i.title} templates={templates} />
            ) : (
              <p className="osEmpty" key={i.proposalId}>
                {i.title} — o material ainda não foi preparado.
              </p>
            ),
          )
        ) : (
          <p className="osEmpty">Nada à sua espera.</p>
        )}
      </section>

      <section className="osSection">
        <h2>Pronto para produzir</h2>
        <p className="osNote">
          {stock.ready} de {stock.target} no estoque. Pequeno de propósito: fila grande vira dívida.
        </p>
        {ready.length ? (
          <div className="osRows">
            {ready.map((i) => (
              <Line key={i.proposalId} item={i} next="in_production" cta="Comecei a gravar" />
            ))}
          </div>
        ) : (
          <p className="osEmpty">Nada validado ainda.</p>
        )}
      </section>

      {inProduction.length ? (
        <section className="osSection">
          <h2>Em produção</h2>
          <div className="osRows">
            {inProduction.map((i) => (
              <Line key={i.proposalId} item={i} next="published" cta="Publiquei" />
            ))}
          </div>
        </section>
      ) : null}

      <Sessions groups={groups} saved={savedSessions} />
    </>
  );
}

function Line({ item, next, cta }: { item: ProductionItem; next: 'in_production' | 'published'; cta: string }) {
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  return (
    <div className="osRow">
      <div>
        <span className="osRowName">{item.title}</span>
        <p className="osRowSub">{item.angle}</p>
        <div className="osMeta">
          <span className="osTag" data-tone="mute">{item.formatLabel}</span>
          <span className="osTag" data-tone="mute">{item.statusLabel}</span>
        </div>
        {erro ? <p className="osWarn">{erro}</p> : null}
      </div>
      <div className="osRowSide">
        <button
          className="chip"
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await moveProposal(item.proposalId, next);
              if ('error' in r) setErro(r.error);
            })
          }
        >
          {cta}
        </button>
        {pending ? <Spinner /> : null}
      </div>
    </div>
  );
}

function Sessions({
  groups,
  saved,
}: {
  groups: SessionGroupView[];
  saved: { id: string; label: string; checklist: string[]; needsOuting: boolean }[];
}) {
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  return (
    <section className="osSection">
      <h2>Gravar de uma vez</h2>
      <p className="osNote">
        Peças que partilham cenário, tipo de fala e equipamento. Montar uma vez em vez de três.
      </p>

      {groups.length === 0 && saved.length === 0 ? (
        <p className="osEmpty">Ainda não há duas peças compatíveis.</p>
      ) : null}

      {groups.map((g) => (
        <div className="cbSession" key={g.key}>
          <h3>{g.label}</h3>
          <div className="osMeta">
            {g.shared.map((s) => (
              <span className="osTag" data-tone="mute" key={s}>{s}</span>
            ))}
            {g.needsOuting ? <span className="osTag">Precisa sair</span> : null}
          </div>
          <ol className="cbChecklist">
            {g.checklist.map((c, i) => (
              <li key={`${i}-${c.slice(0, 10)}`}>{c}</li>
            ))}
          </ol>
        </div>
      ))}

      {groups.length ? (
        <button
          className="osStart"
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await groupSession();
              if ('error' in r) setErro(r.error);
            })
          }
        >
          Salvar como sessão
        </button>
      ) : null}

      {saved.map((s) => (
        <div className="cbSession" key={s.id}>
          <h3>{s.label}</h3>
          <ol className="cbChecklist">
            {s.checklist.map((c, i) => (
              <li key={`${i}-${c.slice(0, 10)}`}>{c}</li>
            ))}
          </ol>
          <button
            className="focusSkip"
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await finishSession(s.id);
                if ('error' in r) setErro(r.error);
              })
            }
          >
            Gravei tudo
          </button>
        </div>
      ))}

      {pending ? <Spinner /> : null}
      {erro ? <p className="osWarn">{erro}</p> : null}
    </section>
  );
}
