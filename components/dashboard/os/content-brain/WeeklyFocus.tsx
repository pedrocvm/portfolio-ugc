'use client';

import { useTransition } from 'react';
import Spinner from '@/components/dashboard/Spinner';
import { planThisWeek } from '@/app/dashboard/content-brain-actions';
import type { FunctionalPillar } from '@/modules/content-brain/domain';

/** O foco da semana, discreto, no topo de «Para gravar».
 *
 *  Não é um dashboard: é uma frase que responde a «o que estamos tentando
 *  fazer agora?». Quando falta matéria-prima, diz isso — e o botão leva a
 *  mapear, nunca a gerar. */

export type WeeklyFocusData = {
  pillar: FunctionalPillar;
  label: string;
  rationale: string;
  slots: { kind: string; title: string; ready: boolean; purpose: string }[];
  gaps: { label: string; available: number }[];
  mappingOnly: boolean;
  hasPlan: boolean;
};

export default function WeeklyFocus({ data, mapCta }: { data: WeeklyFocusData; mapCta?: React.ReactNode }) {
  const [pending, start] = useTransition();

  return (
    <section className="cbFocus">
      <p className="cbFocusEyebrow">Esta semana</p>
      <h2 className="cbFocusTitle">{data.label}</h2>
      <p className="cbFocusWhy">{data.rationale}</p>

      {data.mappingOnly ? (
        <div className="cbFocusGap">
          <p>Antes de plano, matéria-prima. Uma sessão curta abastece a semana.</p>
          {mapCta}
        </div>
      ) : (
        <ul className="cbFocusSlots">
          {data.slots
            .filter((s) => s.kind !== 'map_pillar')
            .map((s, i) => (
              <li key={i}>
                <span>{s.title}</span>
                <span className="osTag" data-tone={s.ready ? 'won' : 'mute'}>
                  {s.ready ? 'pronta' : 'em estrutura'}
                </span>
              </li>
            ))}
        </ul>
      )}

      {data.gaps.length ? (
        <p className="osNote">
          {data.gaps.map((g) => `${g.label} tem ${g.available === 0 ? 'nada salvo' : `${g.available} ${g.available === 1 ? 'situação' : 'situações'}`}`).join('; ')}.
        </p>
      ) : null}

      {!data.hasPlan ? (
        <button
          className="chip"
          type="button"
          disabled={pending}
          onClick={() => start(async () => { await planThisWeek(); })}
        >
          {pending ? <Spinner /> : null} Montar a semana
        </button>
      ) : null}
    </section>
  );
}
