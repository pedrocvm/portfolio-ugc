'use client';

import { useState, useTransition } from 'react';
import Spinner from '@/components/dashboard/Spinner';
import {
  adjustMaterial,
  chooseTemplate,
  validateMaterial,
} from '@/app/dashboard/content-strategy-actions';
import type { PackPayload } from '@/modules/content-brain/pack';

/** O material de produção, na forma do formato.
 *
 *  Um Reel falado mostra-se frase a frase porque é assim que ela grava. Um
 *  carrossel mostra-se slide a slide. Não há um «roteiro» genérico aqui, e é
 *  essa a diferença entre este painel e um campo de texto grande. */

export type PackData = {
  id: string;
  proposalId: string;
  kindLabel: string;
  deliverables: readonly string[];
  payload: PackPayload;
  gaps: string[];
  status: string;
  templateKey: string | null;
};

export default function PackView({
  pack,
  title,
  templates,
}: {
  pack: PackData;
  title: string;
  templates: { key: string; label: string; pendingTokens: string[] }[];
}) {
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const precisaTemplate = pack.payload.kind === 'carousel' || pack.payload.kind === 'photo_sequence';

  return (
    <article className="cbPack">
      <header>
        <h3>{title}</h3>
        <span className="osTag" data-tone={pack.status === 'validated' ? 'won' : 'mute'}>
          {pack.kindLabel}
        </span>
      </header>

      <Body payload={pack.payload} />

      {precisaTemplate ? (
        <div className="cbActs">
          {templates.map((t) => (
            <button
              key={t.key}
              className="chip"
              type="button"
              data-on={pack.templateKey === t.key || undefined}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await chooseTemplate(pack.id, t.key);
                  if ('error' in r) setErro(r.error);
                })
              }
            >
              {t.label}
              {t.pendingTokens.length ? ` · ${t.pendingTokens.length} por decidir` : ''}
            </button>
          ))}
        </div>
      ) : null}

      {pack.gaps.length ? (
        <div className="cbGaps">
          <b>Falta para poder gravar</b>
          <ul>
            {pack.gaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {pack.status !== 'validated' ? (
        <div className="cbActs">
          <button
            className="osStart"
            type="button"
            disabled={pending || pack.gaps.length > 0}
            onClick={() =>
              start(async () => {
                setErro(null);
                const r = await validateMaterial(pack.id);
                if ('error' in r) setErro(r.error);
              })
            }
          >
            Validar
          </button>
          <button
            className="chip"
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setErro(null);
                const r = await adjustMaterial(pack.proposalId, 'Pediu outra versão.');
                if ('error' in r) setErro(r.error);
              })
            }
          >
            Quero ajustar
          </button>
        </div>
      ) : (
        <p className="osNote">Validado por você. Pode gravar.</p>
      )}

      {pending ? <Spinner /> : null}
      {erro ? <p className="osWarn">{erro}</p> : null}
    </article>
  );
}

function Body({ payload }: { payload: PackPayload }) {
  switch (payload.kind) {
    case 'spoken_reel': {
      const b = payload.body;
      return (
        <>
          <Field label="Gancho">{b.hook}</Field>
          <Lines lines={b.lines} />
          {b.scenes.length ? (
            <Field label="Cenas">{b.scenes.map((s) => `${s.order + 1}. ${s.what}`).join(' · ')}</Field>
          ) : null}
          <Assets assets={b.assets} />
          {b.performance ? <Field label="Performance">{b.performance}</Field> : null}
          {b.editing ? <Field label="Edição">{b.editing}</Field> : null}
          {b.cover ? <Field label="Capa">{b.cover}</Field> : null}
          {b.caption ? <Field label="Legenda">{b.caption}</Field> : null}
          {b.cta ? <Field label="CTA">{`${b.cta.text} — ${b.cta.because}`}</Field> : null}
        </>
      );
    }
    case 'tech_ugc': {
      const b = payload.body;
      return (
        <>
          <Field label="O produto">{b.productUnderstanding}</Field>
          <Field label="Situação de uso">{b.useSituation}</Field>
          <Field label="Argumento">{b.argument}</Field>
          <Lines lines={b.lines} />
          {b.interface ? <Field label="Interface">{b.interface}</Field> : null}
          <Assets assets={b.screenRecordings} />
          {b.demonstration ? <Field label="Demonstração">{b.demonstration}</Field> : null}
          {b.persuasion ? <Field label="Persuasão">{b.persuasion}</Field> : null}
          {b.caption ? <Field label="Legenda">{b.caption}</Field> : null}
          {b.cta ? <Field label="CTA">{`${b.cta.text} — ${b.cta.because}`}</Field> : null}
        </>
      );
    }
    case 'canvas_ugc': {
      const b = payload.body;
      return (
        <>
          <Field label="Mecânica">{b.mechanic}</Field>
          <Field label="Estrutura observada">{b.observedStructure}</Field>
          <Field label="Execução">{b.execution}</Field>
          {b.brandAdaptation ? <Field label="Adaptação">{b.brandAdaptation}</Field> : null}
          {b.lines.length ? <Lines lines={b.lines} /> : null}
          {b.experimentalVariable ? <Field label="Variável em teste">{b.experimentalVariable}</Field> : null}
          {b.caption ? <Field label="Legenda">{b.caption}</Field> : null}
        </>
      );
    }
    case 'carousel': {
      const b = payload.body;
      return (
        <>
          <Field label="Capa">{b.cover}</Field>
          <ol className="cbSlides">
            {b.slides.map((s) => (
              <li key={s.index}>
                <p>{s.copy}</p>
                {s.composition ? <span className="osRowSub">{s.composition}</span> : null}
              </li>
            ))}
          </ol>
          {b.typography ? <Field label="Tipografia">{b.typography}</Field> : null}
          {b.palette ? <Field label="Paleta">{b.palette}</Field> : null}
          <Assets assets={b.assets} />
          {b.caption ? <Field label="Legenda">{b.caption}</Field> : null}
          {b.cta ? <Field label="CTA">{`${b.cta.text} — ${b.cta.because}`}</Field> : null}
        </>
      );
    }
    case 'photo_sequence': {
      const b = payload.body;
      return (
        <>
          <ol className="cbSlides">
            {b.photos.map((p) => (
              <li key={p.index}>
                <p>{p.role}</p>
                {p.selection ? <span className="osRowSub">{p.selection}</span> : null}
                {p.overlayText ? <span className="osRowSub">Texto: {p.overlayText}</span> : null}
                {p.treatment ? <span className="osRowSub">{p.treatment}</span> : null}
              </li>
            ))}
          </ol>
          {b.caption ? <Field label="Legenda">{b.caption}</Field> : null}
          {b.cta ? <Field label="CTA">{`${b.cta.text} — ${b.cta.because}`}</Field> : null}
        </>
      );
    }
    case 'story_sequence': {
      const b = payload.body;
      return (
        <ol className="cbSlides">
          {b.frames.map((f) => (
            <li key={f.index}>
              <p>{f.content}</p>
              <span className="osRowSub">{f.role}</span>
              {f.linkToNext ? <span className="osRowSub">Liga: {f.linkToNext}</span> : null}
              {f.interaction ? (
                <span className="osRowSub">
                  {f.interaction.text} — {f.interaction.because}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      );
    }
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <p className="cbField">
      <b>{label}</b> {children}
    </p>
  );
}

/** Frase a frase, numeradas. É a preferência explícita dela e o motivo de não
 *  existir aqui um parágrafo de roteiro. */
function Lines({ lines }: { lines: readonly { text: string; note?: string }[] }) {
  if (!lines.length) return null;
  return (
    <ol className="cbLines">
      {lines.map((l, i) => (
        <li key={`${i}-${l.text.slice(0, 12)}`}>
          <span>{l.text}</span>
          {l.note ? <em>{l.note}</em> : null}
        </li>
      ))}
    </ol>
  );
}

function Assets({ assets }: { assets: readonly { kind: string; what: string; ready: boolean }[] }) {
  if (!assets.length) return null;
  return (
    <ul className="cbAssets">
      {assets.map((a, i) => (
        <li key={`${a.kind}-${i}`} data-ready={a.ready || undefined}>
          {a.what}
          {a.ready ? '' : ' · por preparar'}
        </li>
      ))}
    </ul>
  );
}
