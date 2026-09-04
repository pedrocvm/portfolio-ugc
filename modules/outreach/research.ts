import 'server-only';

import type { HospitalityProfile, OutreachResearch } from '@/modules/ai/schemas';
import type { Discovered } from './discovery';

/** Pesquisa profunda de uma candidata. Só corre para quem passou a triagem
 *  barata — é a etapa cara do funil. */
export type Researched = {
  candidate: Discovered;
  research: OutreachResearch;
  /** Enriquecimento por categoria. Hoje só hotelaria; null quando não se pediu
   *  ou quando não deu. */
  hospitality: HospitalityProfile | null;
};

/** Vai ao site e ao Instagram buscar o que só lá está.
 *
 *  Isto corria sem web nenhuma: o modelo respondia de memória, e como o prompt
 *  — bem — proíbe inventar contatos, o contato vinha sempre a null. O
 *  WhatsApp e o @ da marca estão na página de contatos e na bio; sem lá ir, não
 *  há como os saber.
 *
 *  Devolve prosa. A estrutura vem na volta seguinte, porque pedir pesquisa e
 *  JSON no mesmo turno dá JSON pior — e o Gemini nem deixa combinar pesquisa com
 *  saída estruturada.
 *
 *  É exportada porque a mesma prosa serve três leituras diferentes — quem é a
 *  empresa, se vale a pena abordá-la, e que experiência há para gravar. Pesquisar
 *  três vezes a mesma marca seria pagar três vezes pela mesma página. */
export async function gatherFacts(
  candidate: Discovered,
  opts: { hospitality?: boolean; identity?: boolean } = {},
): Promise<string> {
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

  const extra = [
    opts.identity
      ? 'Confirma primeiro QUE EMPRESA é esta: nome oficial, domínio do site, @ do ' +
        'perfil oficial, cidade, país e grupo a que pertence, dizendo onde viste cada ' +
        'coisa. Se houver mais do que uma empresa com este nome, diz quais são.'
      : '',
    opts.hospitality
      ? 'É hotelaria: procura também o tipo de casa, o lugar, quartos, villas, spa, ' +
        'wellness, restaurante e mesa, vinho e enoturismo, piscina, natureza, ' +
        'arquitetura, experiências locais e o que a distingue. Interessa a EXPERIÊNCIA ' +
        'que ali se atravessa, não a lista de instalações.'
      : '',
  ].filter(Boolean);

  try {
    return await setup.provider.search({
      model: setup.models.chat,
      system:
        'Pesquisas uma marca para uma criadora de conteúdo a avaliar se vale a pena abordá-la. ' +
        'Procura: o produto principal, se investem em anúncios, se já trabalham com creators, ' +
        'e sobretudo COMO SE FALA COM ELES — página de contatos do site, link de WhatsApp ' +
        '(wa.me), Instagram da marca, email de marketing ou parcerias. ' +
        'Escreve o que encontraste em texto corrido, dizendo em que página viste cada coisa. ' +
        'Não inventes contatos: se não encontraste, diz que não encontraste.' +
        (extra.length ? `\n\n${extra.join('\n')}` : ''),
      user: alvo,
      maxTokens: extra.length ? 4000 : 3000,
    });
  } catch {
    // Sem pesquisa continua-se: a ficha sai mais pobre, não sai nenhuma.
    return '';
  }
}

export async function researchCandidate(
  candidate: Discovered,
  /** `facts` evita uma segunda pesquisa quando quem chama já a fez.
   *  `hospitality` liga o perfil de categoria — está desligado por omissão para
   *  a corrida diária e a busca dirigida não passarem a pagar uma chamada a
   *  mais por cada hotel que encontrem. */
  opts: { facts?: string; hospitality?: boolean } = {},
): Promise<Researched | null> {
  const { runPrompt } = await import('@/modules/ai/gateway');
  const { outreachResearch, hospitalityProfile } = await import('@/modules/ai/prompts/registry');

  const facts = opts.facts ?? (await gatherFacts(candidate, { hospitality: opts.hospitality }));

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

  let hospitality: HospitalityProfile | null = null;
  if (opts.hospitality && facts) {
    const perfil = await runPrompt(
      hospitalityProfile,
      { brand: candidate.name, facts, today: new Date().toISOString().slice(0, 10) },
      { cache: true, entityType: 'outreach_candidate' },
    );
    // Um perfil que falha não derruba a pesquisa: a ficha sai sem ele.
    if (perfil.ok) hospitality = perfil.output;
  }

  return { candidate, research: run.output, hospitality };
}
