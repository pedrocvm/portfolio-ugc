import 'server-only';

import type { OutreachResearch } from '@/modules/ai/schemas';
import type { Discovered } from './discovery';

/** Pesquisa profunda de uma candidata. Só corre para quem passou a triagem
 *  barata — é a etapa cara do funil. */
export type Researched = { candidate: Discovered; research: OutreachResearch };

/** Vai ao site e ao Instagram buscar o que só lá está.
 *
 *  Isto corria sem web nenhuma: o modelo respondia de memória, e como o prompt
 *  — bem — proíbe inventar contatos, o contato vinha sempre a null. O
 *  WhatsApp e o @ da marca estão na página de contatos e na bio; sem lá ir, não
 *  há como os saber.
 *
 *  Devolve prosa. A estrutura vem na volta seguinte, porque pedir pesquisa e
 *  JSON no mesmo turno dá JSON pior — e o Gemini nem deixa combinar pesquisa com
 *  saída estruturada. */
async function gatherFacts(candidate: Discovered): Promise<string> {
  const { aiSetup } = await import('@/modules/ai/provider');
  const setup = aiSetup();
  if (!setup.provider) return '';

  const alvo = [
    `Marca: ${candidate.name}`,
    candidate.website ? `Site: ${candidate.website}` : '',
    candidate.description ? `Nota: ${candidate.description}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    return await setup.provider.search({
      model: setup.models.chat,
      system:
        'Pesquisas uma marca para uma criadora de conteúdo a avaliar se vale a pena abordá-la. ' +
        'Procura: o produto principal, se investem em anúncios, se já trabalham com creators, ' +
        'e sobretudo COMO SE FALA COM ELES — página de contatos do site, link de WhatsApp ' +
        '(wa.me), Instagram da marca, email de marketing ou parcerias. ' +
        'Escreve o que encontraste em texto corrido, dizendo em que página viste cada coisa. ' +
        'Não inventes contatos: se não encontraste, diz que não encontraste.',
      user: alvo,
      maxTokens: 3000,
    });
  } catch {
    // Sem pesquisa continua-se: a ficha sai mais pobre, não sai nenhuma.
    return '';
  }
}

export async function researchCandidate(candidate: Discovered): Promise<Researched | null> {
  const { runPrompt } = await import('@/modules/ai/gateway');
  const { outreachResearch } = await import('@/modules/ai/prompts/registry');

  const facts = await gatherFacts(candidate);

  const run = await runPrompt(
    outreachResearch,
    {
      brand: candidate.name,
      website: candidate.website,
      notes: [
        candidate.description,
        candidate.why,
        candidate.source ? `Visto em: ${candidate.source}` : '',
        facts ? `\n--- O que a pesquisa na web devolveu ---\n${facts.slice(0, 12000)}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      today: new Date().toISOString().slice(0, 10),
    },
    { cache: true, entityType: 'outreach_candidate' },
  );

  if (!run.ok) return null;
  return { candidate, research: run.output };
}
