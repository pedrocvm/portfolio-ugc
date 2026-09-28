'use client';

import { useState, useTransition } from 'react';
import Spinner from '@/components/dashboard/Spinner';
import {
  changeCapacity,
  changeFocus,
  changeTopicState,
  createTopic,
} from '@/app/dashboard/content-strategy-actions';
import {
  FOCUS_ITEMS,
  FOCUS_ITEM_LABEL,
  TOPIC_STATES,
  TOPIC_STATE_LABEL,
  TOPIC_STATE_NOTE,
  type FocusItem,
  type Pillar,
  type TopicState,
} from '@/modules/content-brain/editorial';

/** O Mapa: sobre o que a Carol fala.
 *
 *  Três territórios, os assuntos de cada um, e em que fase está cada assunto.
 *  Não é banco de ideias — aqui não nasce nenhum post. Mudar de fase não apaga
 *  nada: um assunto pausado continua no mapa. */

export type TopicRow = {
  id: string;
  label: string;
  howToTreat: string;
  state: TopicState;
  origin: string;
  lastUsedAt: string | null;
  useCount: number;
};

export type PillarView = {
  pillar: Pillar;
  label: string;
  purpose: string;
  guardrails: readonly string[];
  topics: TopicRow[];
  liveCount: number;
};

export default function MapPane({
  pillars,
  focus,
  capacity,
  commercialFocus,
}: {
  pillars: PillarView[];
  focus: { label: string; items: FocusItem[]; itemLabels: string[]; since: string } | null;
  capacity: number;
  commercialFocus: { market: string; contexts: readonly string[] };
}) {
  return (
    <>
      <Focus focus={focus} commercialFocus={commercialFocus} capacity={capacity} />

      {pillars.map((p) => (
        <section className="osSection" key={p.pillar}>
          <h2>{p.label}</h2>
          <p className="osNote">{p.purpose}</p>
          <div className="osRows">
            {p.topics.map((t) => (
              <TopicLine key={t.id} topic={t} />
            ))}
          </div>
          {p.topics.length === 0 ? <p className="osEmpty">Sem assuntos aqui ainda.</p> : null}
          <NewTopic pillar={p.pillar} />
        </section>
      ))}
    </>
  );
}

function Focus({
  focus,
  commercialFocus,
  capacity,
}: {
  focus: { label: string; items: FocusItem[]; itemLabels: string[]; since: string } | null;
  commercialFocus: { market: string; contexts: readonly string[] };
  capacity: number;
}) {
  const [abrir, setAbrir] = useState(false);
  const [sel, setSel] = useState<FocusItem[]>(focus?.items ?? []);
  const [cap, setCap] = useState(capacity);
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  return (
    <section className="osSection">
      <h2>Foco atual</h2>
      <p className="osNote">
        A fase em que você está. Muda quando a fase muda, e não mexe nos pilares — eles são mais
        lentos de propósito.
      </p>
      <div className="osMeta">
        {(focus?.itemLabels ?? []).map((l) => (
          <span className="osTag" key={l}>{l}</span>
        ))}
        {!focus ? <span className="osTag" data-tone="mute">Ainda não definido</span> : null}
      </div>

      <p className="osNote">
        <b>Foco comercial:</b> {commercialFocus.market}. É o mercado, não um pilar — o software é o
        cliente, o negócio local é o contexto que ele atende.
      </p>

      <button className="focusSkip" type="button" onClick={() => setAbrir((a) => !a)}>
        {abrir ? 'Fechar' : 'Mudar o foco'}
      </button>

      {abrir ? (
        <div className="cbAdjust">
          <div className="cbActs">
            {FOCUS_ITEMS.map((i) => (
              <button
                key={i}
                type="button"
                className="chip"
                data-on={sel.includes(i) || undefined}
                onClick={() => setSel((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]))}
              >
                {FOCUS_ITEM_LABEL[i]}
              </button>
            ))}
          </div>

          <label htmlFor="cap">Posts por semana que você consegue sustentar</label>
          <input
            id="cap"
            type="number"
            min={1}
            max={7}
            value={cap}
            onChange={(e) => setCap(Number(e.target.value))}
          />

          <button
            className="osStart"
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setErro(null);
                const a = await changeFocus(sel);
                if ('error' in a) return setErro(a.error);
                if (cap !== capacity) {
                  const b = await changeCapacity(cap);
                  if ('error' in b) return setErro(b.error);
                }
                setAbrir(false);
              })
            }
          >
            Salvar
          </button>
          {pending ? <Spinner /> : null}
          {erro ? <p className="osWarn">{erro}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

function TopicLine({ topic }: { topic: TopicRow }) {
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [abrir, setAbrir] = useState(false);

  return (
    <div className="osRow">
      <div>
        <span className="osRowName">{topic.label}</span>
        <p className="osRowSub">{topic.howToTreat}</p>
        <div className="osMeta">
          <span className="osTag" data-tone={topic.state === 'now' ? 'won' : 'mute'}>
            {TOPIC_STATE_LABEL[topic.state]}
          </span>
          {topic.useCount > 0 ? (
            <span className="osTag" data-tone="mute">
              {topic.useCount} {topic.useCount === 1 ? 'peça' : 'peças'}
            </span>
          ) : (
            <span className="osTag" data-tone="mute">Ainda não usado</span>
          )}
          {topic.origin === 'carol' ? <span className="osTag" data-tone="mute">Seu</span> : null}
        </div>
        {abrir ? (
          <div className="cbActs">
            {TOPIC_STATES.map((s) => (
              <button
                key={s}
                className="chip"
                type="button"
                data-on={topic.state === s || undefined}
                disabled={pending}
                title={TOPIC_STATE_NOTE[s]}
                onClick={() =>
                  start(async () => {
                    const r = await changeTopicState(topic.id, s);
                    if ('error' in r) setErro(r.error);
                    else setAbrir(false);
                  })
                }
              >
                {TOPIC_STATE_LABEL[s]}
              </button>
            ))}
          </div>
        ) : null}
        {erro ? <p className="osWarn">{erro}</p> : null}
      </div>
      <div className="osRowSide">
        <button className="focusSkip" type="button" onClick={() => setAbrir((a) => !a)}>
          {abrir ? 'Fechar' : 'Mudar fase'}
        </button>
        {pending ? <Spinner /> : null}
      </div>
    </div>
  );
}

function NewTopic({ pillar }: { pillar: Pillar }) {
  const [abrir, setAbrir] = useState(false);
  const [label, setLabel] = useState('');
  const [como, setComo] = useState('');
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  if (!abrir) {
    return (
      <button className="focusSkip" type="button" onClick={() => setAbrir(true)}>
        Acrescentar assunto
      </button>
    );
  }

  return (
    <div className="cbAdjust">
      <label htmlFor={`t-${pillar}`}>Assunto</label>
      <input id={`t-${pillar}`} value={label} onChange={(e) => setLabel(e.target.value)} />
      <label htmlFor={`h-${pillar}`}>Como tratar</label>
      <input id={`h-${pillar}`} value={como} onChange={(e) => setComo(e.target.value)} />
      <div className="cbActs">
        <button
          className="osStart"
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setErro(null);
              const r = await createTopic({ pillar, label, howToTreat: como });
              if ('error' in r) setErro(r.error);
              else {
                setLabel('');
                setComo('');
                setAbrir(false);
              }
            })
          }
        >
          Acrescentar
        </button>
        <button className="focusSkip" type="button" onClick={() => setAbrir(false)}>
          Cancelar
        </button>
      </div>
      {pending ? <Spinner /> : null}
      {erro ? <p className="osWarn">{erro}</p> : null}
    </div>
  );
}
