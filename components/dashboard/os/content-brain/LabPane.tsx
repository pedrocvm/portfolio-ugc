'use client';

import { useState, useTransition } from 'react';
import Spinner from '@/components/dashboard/Spinner';
import {
  addRadarCreator,
  dropRadarCreator,
  saveReference,
} from '@/app/dashboard/content-strategy-actions';

/** O Laboratório: o que ainda precisamos descobrir.
 *
 *  Não mostra formatos por testar como se fossem maus, e não declara nenhum
 *  vencedor por ausência de alternativa. «Não testado» é uma resposta
 *  completa, e é a que aparece na maior parte da tela hoje. */

export type MaturityRow = {
  dimension: string;
  dimensionLabel: string;
  value: string;
  valueLabel: string;
  state: string;
  stateLabel: string;
  phrasing: string;
  because: string;
  sampleSize: number;
  comparedWith: number;
};

export type ReferenceRow = {
  id: string;
  url: string;
  platform: string;
  handle: string | null;
  status: string;
  structure: string;
  question: string;
  durationSeconds: number | null;
  sceneCount: number | null;
  effort: string | null;
  unknown: string[];
  fromRadar: boolean;
};

export type ExperimentRow = {
  id: string;
  label: string;
  question: string;
  variable: string;
  constants: string[];
  status: string;
  outcome: string;
  outcomeLabel: string;
  because: string;
  sampleSize: number;
  reelTest: boolean;
};

export default function LabPane({
  formats,
  others,
  experiments,
  references,
  radar,
  radarBlocked,
}: {
  formats: MaturityRow[];
  others: MaturityRow[];
  experiments: ExperimentRow[];
  references: ReferenceRow[];
  radar: { id: string; handle: string; platform: string; why: string }[];
  radarBlocked: string;
}) {
  return (
    <>
      <section className="osSection">
        <h2>Formatos</h2>
        <p className="osNote">
          O que já foi comparado e o que ainda não. Onze Reels seguidos dizem que Reel foi usado —
          não que Reel é melhor.
        </p>
        <div className="osRows">
          {formats.map((f) => (
            <Maturity key={`${f.dimension}-${f.value}`} row={f} />
          ))}
        </div>
      </section>

      {others.length ? (
        <section className="osSection">
          <h2>Como você funciona</h2>
          <p className="osNote">
            A assinatura das suas peças: abertura, ritmo, presença, áudio. Sai do material de
            produção, você não preenche nada.
          </p>
          <div className="osRows">
            {others.map((f) => (
              <Maturity key={`${f.dimension}-${f.value}`} row={f} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="osSection">
        <h2>Testes</h2>
        <p className="osNote">Um de cada vez. Sem pergunta boa, nenhum.</p>
        {experiments.length ? (
          <div className="osRows">
            {experiments.map((e) => (
              <div className="osRow" key={e.id}>
                <div>
                  <span className="osRowName">{e.question || e.label}</span>
                  <p className="osRowSub">
                    Muda: {e.variable || 'por definir'}
                    {e.constants.length ? ` · mantém: ${e.constants.join(', ')}` : ''}
                  </p>
                  <div className="osMeta">
                    <span className="osTag" data-tone="mute">{e.outcomeLabel}</span>
                    {e.sampleSize ? <span className="osTag" data-tone="mute">{e.sampleSize} peças</span> : null}
                    {e.reelTest ? <span className="osTag" data-tone="won">Reel Test recomendado</span> : null}
                  </div>
                  {e.because ? <p className="osRowSub">{e.because}</p> : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="osEmpty">Nenhum teste em curso.</p>
        )}
      </section>

      <References items={references} />
      <Radar items={radar} blocked={radarBlocked} />
    </>
  );
}

function Maturity({ row }: { row: MaturityRow }) {
  return (
    <div className="osRow">
      <div>
        <span className="osRowName">{row.valueLabel}</span>
        <p className="osRowSub">{row.phrasing}</p>
        <p className="osRowSub">{row.because}</p>
      </div>
      <div className="osRowSide">
        <span
          className="osTag"
          data-tone={row.state === 'consistent_pattern' ? 'won' : row.state === 'no_advantage' ? 'lost' : 'mute'}
        >
          {row.stateLabel}
        </span>
      </div>
    </div>
  );
}

function References({ items }: { items: ReferenceRow[] }) {
  const [url, setUrl] = useState('');
  const [nota, setNota] = useState('');
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  return (
    <section className="osSection">
      <h2>Referências</h2>
      <p className="osNote">
        Cole o link de um Reel que te chamou atenção. Eu leio a engenharia dele — estrutura,
        abertura, ritmo — e salvo como hipótese para testar. O assunto e a pessoa ficam de fora.
      </p>

      <div className="cbAdjust">
        <label htmlFor="ref-url">Link</label>
        <input id="ref-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
        <label htmlFor="ref-note">O que te chamou atenção (opcional)</label>
        <input id="ref-note" value={nota} onChange={(e) => setNota(e.target.value)} />
        <button
          className="osStart"
          type="button"
          disabled={pending || url.trim().length < 8}
          onClick={() =>
            start(async () => {
              setErro(null);
              setAviso(null);
              const r = await saveReference(url.trim(), nota.trim() || undefined);
              if ('error' in r) return setErro(r.error);
              setUrl('');
              setNota('');
              if (!r.analysed) setAviso('Guardei. Não consegui ver o vídeo para tirar a estrutura sozinho.');
            })
          }
        >
          Salvar
        </button>
        {pending ? <Spinner /> : null}
        {erro ? <p className="osWarn">{erro}</p> : null}
        {aviso ? <p className="osNote">{aviso}</p> : null}
      </div>

      {items.length ? (
        <div className="osRows">
          {items.map((r) => (
            <div className="osRow" key={r.id}>
              <div>
                <span className="osRowName">{r.handle ? `@${r.handle}` : r.platform}</span>
                {r.structure ? <p className="osRowSub">{r.structure}</p> : null}
                {r.question ? <p className="osRowSub">Vale testar: {r.question}</p> : null}
                <div className="osMeta">
                  {r.durationSeconds ? <span className="osTag" data-tone="mute">{r.durationSeconds}s</span> : null}
                  {r.sceneCount ? <span className="osTag" data-tone="mute">{r.sceneCount} cenas</span> : null}
                  {r.effort ? <span className="osTag" data-tone="mute">esforço {r.effort}</span> : null}
                  {r.fromRadar ? <span className="osTag" data-tone="mute">do Radar</span> : null}
                </div>
                {r.status !== 'done' ? (
                  <p className="osRowSub">Não consegui ler a estrutura automaticamente.</p>
                ) : r.unknown.length ? (
                  <p className="osRowSub">Não consegui ver: {r.unknown.join(', ')}.</p>
                ) : null}
              </div>
              <div className="osRowSide">
                <a className="chip" href={r.url} target="_blank" rel="noreferrer">Abrir</a>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="osEmpty">Nenhuma referência salva ainda.</p>
      )}
    </section>
  );
}

function Radar({ items, blocked }: { items: { id: string; handle: string; platform: string; why: string }[]; blocked: string }) {
  const [handle, setHandle] = useState('');
  const [why, setWhy] = useState('');
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  return (
    <section className="osSection">
      <h2>Radar</h2>
      <p className="osNote">
        Poucas creators para observar. Não é um feed: o que sai daqui é hipótese para testar, nunca
        regra para copiar.
      </p>
      <p className="osNote">{blocked}</p>

      {items.length ? (
        <div className="osRows">
          {items.map((r) => (
            <div className="osRow" key={r.id}>
              <div>
                <span className="osRowName">@{r.handle}</span>
                {r.why ? <p className="osRowSub">{r.why}</p> : null}
              </div>
              <div className="osRowSide">
                <button
                  className="focusSkip"
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const x = await dropRadarCreator(r.id);
                      if ('error' in x) setErro(x.error);
                    })
                  }
                >
                  Tirar
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="osEmpty">Nenhuma creator no Radar.</p>
      )}

      <div className="cbAdjust">
        <label htmlFor="radar-handle">@ da creator</label>
        <input id="radar-handle" value={handle} onChange={(e) => setHandle(e.target.value)} />
        <label htmlFor="radar-why">Por que ela</label>
        <input id="radar-why" value={why} onChange={(e) => setWhy(e.target.value)} />
        <button
          className="chip"
          type="button"
          disabled={pending || handle.trim().length < 2}
          onClick={() =>
            start(async () => {
              setErro(null);
              const r = await addRadarCreator({ handle: handle.trim(), why: why.trim() });
              if ('error' in r) return setErro(r.error);
              setHandle('');
              setWhy('');
            })
          }
        >
          Acrescentar
        </button>
        {pending ? <Spinner /> : null}
        {erro ? <p className="osWarn">{erro}</p> : null}
      </div>
    </section>
  );
}
