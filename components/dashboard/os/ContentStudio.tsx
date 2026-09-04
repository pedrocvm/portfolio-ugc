'use client';

import { useState } from 'react';
import Segmented from '@/components/dashboard/Segmented';

export const STUDIO_TABS = ['record', 'tests', 'published', 'bank', 'strategy'] as const;
export type StudioTab = (typeof STUDIO_TABS)[number];

const LABEL: Record<StudioTab, string> = {
  record: 'Para gravar',
  tests: 'Testes',
  published: 'Publicado',
  bank: 'Banco',
  strategy: 'Estratégia',
};

export const isStudioTab = (v: string | undefined): v is StudioTab => (STUDIO_TABS as readonly string[]).includes(v ?? '');

/** O Conteúdo em cinco contextos, não um cockpit.
 *
 *  O dia a dia continua a chegar pelo Hoje. Isto é a área profunda: o plano
 *  inteiro, os testes, o que saiu e como correu, o banco, e — só quando quiser
 *  aprofundar — a estratégia. */
export default function ContentStudio({
  initial,
  panes,
}: {
  initial: StudioTab;
  panes: Record<StudioTab, React.ReactNode>;
}) {
  const [tab, setTab] = useState<StudioTab>(initial);

  return (
    <>
      <div className="csTabs">
        <Segmented options={STUDIO_TABS.map((id) => ({ id, label: LABEL[id] }))} value={tab} onChange={setTab} label="Área do conteúdo" />
      </div>
      {panes[tab]}
    </>
  );
}
