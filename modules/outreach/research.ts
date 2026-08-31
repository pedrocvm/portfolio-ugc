import 'server-only';

import type { OutreachResearch } from '@/modules/ai/schemas';
import type { Discovered } from './discovery';

/** Pesquisa profunda de uma candidata. Só corre para quem passou a triagem
 *  barata — é a etapa cara do funil. */
export type Researched = { candidate: Discovered; research: OutreachResearch };

export async function researchCandidate(candidate: Discovered): Promise<Researched | null> {
  const { runPrompt } = await import('@/modules/ai/gateway');
  const { outreachResearch } = await import('@/modules/ai/prompts/registry');

  const run = await runPrompt(
    outreachResearch,
    {
      brand: candidate.name,
      website: candidate.website,
      notes: [candidate.description, candidate.why, candidate.source ? `Visto em: ${candidate.source}` : '']
        .filter(Boolean)
        .join('\n'),
      today: new Date().toISOString().slice(0, 10),
    },
    { cache: true, entityType: 'outreach_candidate' },
  );

  if (!run.ok) return null;
  return { candidate, research: run.output };
}
