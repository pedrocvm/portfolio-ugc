'use client';

import { useState } from 'react';
import Segmented from '@/components/dashboard/Segmented';
import { STUDIO_TABS, STUDIO_TAB_LABEL, type StudioTab } from './studioTabs';

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
        <Segmented options={STUDIO_TABS.map((id) => ({ id, label: STUDIO_TAB_LABEL[id] }))} value={tab} onChange={setTab} label="Área do conteúdo" />
      </div>
      {panes[tab]}
    </>
  );
}
