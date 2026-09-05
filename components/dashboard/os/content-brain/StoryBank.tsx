'use client';

import { useState } from 'react';
import StoryWorkshop, { type WorkshopStory } from './StoryWorkshop';
import type { FunctionalPillar } from '@/modules/content-brain/domain';

/** O banco de histórias: a memória editorial dela.
 *
 *  Uma lista, não um kanban. Cada linha diz de onde veio, em que estado está e
 *  se pode virar conteúdo — e a origem importa, porque «você contou» e
 *  «detectei no email» não têm o mesmo peso. */

export type StoryRowView = {
  id: string;
  title: string;
  summary: string;
  status: string;
  statusLabel: string;
  pillarLabel: string | null;
  sourceLabel: string;
  privacyLabel: string;
  isPrivate: boolean;
  needsConfirmation: boolean;
  used: boolean;
  seriesName: string | null;
  facts: string[];
  meaning: string | null;
  frameLabel: string | null;
};

const FILTROS = [
  { id: 'all', label: 'Todas' },
  { id: 'ready', label: 'Prontas' },
  { id: 'developing', label: 'Em desenvolvimento' },
  { id: 'confirm', label: 'Falta confirmar' },
  { id: 'used', label: 'Já usadas' },
] as const;

export default function StoryBank({
  stories,
  focus,
}: {
  stories: StoryRowView[];
  focus: FunctionalPillar;
}) {
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]['id']>('all');

  const lista = stories.filter((s) => {
    if (filtro === 'ready') return s.status === 'ready_to_record';
    if (filtro === 'developing') return ['confirmed', 'mapped', 'structured'].includes(s.status);
    if (filtro === 'confirm') return s.needsConfirmation;
    if (filtro === 'used') return s.used;
    return true;
  });

  if (stories.length === 0) {
    return (
      <section className="osSection">
        <h2>Ainda não guardei nenhuma situação sua.</h2>
        <p className="osNote">
          O conteúdo começa aqui: você conta uma coisa que aconteceu e eu organizo. Não invento
          histórias para preencher calendário.
        </p>
        <StoryWorkshop focus={focus} trigger="Contar uma situação" />
      </section>
    );
  }

  return (
    <section className="osSection">
      <h2>Banco de histórias</h2>

      <div className="cbFilters" role="group" aria-label="Filtrar histórias">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            type="button"
            className="chip"
            aria-pressed={filtro === f.id}
            data-on={filtro === f.id || undefined}
            onClick={() => setFiltro(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {lista.length === 0 ? (
        <p className="osEmpty">Nada aqui com esse filtro.</p>
      ) : (
        <div className="osRows">
          {lista.map((s) => (
            <div className="osRow cbStoryRow" key={s.id}>
              <div>
                <span className="osRowName">{s.title}</span>
                <p className="osRowSub">{s.summary.slice(0, 140)}</p>
                <div className="osMeta">
                  <span className="osTag" data-tone="mute">{s.sourceLabel}</span>
                  {s.pillarLabel ? <span className="osTag" data-tone="mute">{s.pillarLabel}</span> : null}
                  {s.seriesName ? <span className="osTag" data-tone="mute">{s.seriesName}</span> : null}
                  {s.isPrivate ? <span className="osTag" data-tone="hot">Privada</span> : null}
                  {s.used ? <span className="osTag" data-tone="won">Já usada</span> : null}
                </div>
              </div>
              <div className="osRowSide">
                <span className="osTag" data-tone={s.status === 'ready_to_record' ? 'won' : s.needsConfirmation ? 'hot' : 'mute'}>
                  {s.statusLabel}
                </span>
                {!s.isPrivate && !s.used ? (
                  <StoryWorkshop
                    focus={focus}
                    trigger={s.needsConfirmation ? 'Confirmar' : 'Continuar'}
                    story={toWorkshop(s)}
                  />
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="cbBankFoot">
        <StoryWorkshop focus={focus} trigger="Contar outra situação" />
      </div>
    </section>
  );
}

const toWorkshop = (s: StoryRowView): WorkshopStory => ({
  id: s.id,
  title: s.title,
  facts: s.facts,
  meaning: s.meaning,
  pillar: null,
  frameLabel: s.frameLabel,
  hasStructure: s.status === 'structured' || s.status === 'ready_to_record',
  factConfirmed: !s.needsConfirmation,
});
