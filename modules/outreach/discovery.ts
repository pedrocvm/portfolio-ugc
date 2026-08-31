import 'server-only';

import { z } from 'zod';
import { aiSetup } from '@/modules/ai/provider';
import { normalizeDomain, normalizeName } from '@/modules/brands/identity';
import { guessNiche } from '@/modules/brands/niches';
import type { Strategy } from './domain';

/** Encontrar candidatas.
 *
 *  A pesquisa é do lado do fornecedor: o modelo procura na web e devolve nomes
 *  com o sítio onde os viu. Não há scraping em massa nem infra de cold email —
 *  isto procura umas dezenas de empresas por dia, uma vez por dia. */

const Found = z.object({
  brands: z.array(
    z.object({
      name: z.string(),
      website: z.string().nullable(),
      country: z.string().nullable(),
      description: z.string(),
      why: z.string(),
      source: z.string().nullable(),
    }),
  ),
});

export type Discovered = {
  name: string;
  normalizedName: string;
  website: string | null;
  domain: string | null;
  country: string | null;
  description: string;
  why: string;
  source: string | null;
  nicheId: string | null;
};

const PROMPT = `És o motor de descoberta de uma criadora de UGC portuguesa.

Procuras empresas REAIS que ela possa abordar. Regras que não se dobram:

- Só empresas que existem. Se não encontras o site, não a incluas.
- Tech em primeiro: SaaS, apps, produtos digitais, consumer tech, casa
  inteligente, automação, pet tech. Depois casa e lifestyle, fitness, comida.
- Skincare, haircare, cosmética e maquilhagem NÃO entram. Nunca. Nem para
  encher a lista.
- Nada de marcas gigantes onde uma criadora individual não chega a ninguém, e
  nada de dropshipping sem marca própria.
- Cada empresa leva o URL onde a viste.

Devolve entre 15 e 30 empresas. Prefere menos e boas a muitas e vagas.`;

/** Uma passagem de pesquisa. Devolve lista crua: filtrar é a seguir, e é
 *  determinístico. */
export async function discoverBrands(
  strategy: Strategy,
  extra?: string,
): Promise<{ found: Discovered[]; failure: string | null }> {
  const setup = aiSetup();
  if (!setup.provider) return { found: [], failure: `Falta ${setup.missing ?? 'a credencial de IA'}.` };

  const ask = [
    `Nichos a procurar hoje: ${strategy.niches.join(', ')}.`,
    `Mercados: ${strategy.countries.join(', ')}.`,
    `Ângulo: ${strategy.angle}.`,
    extra ? `Pedido específico: ${extra}` : '',
    'Procura na web e devolve as empresas que encontrares.',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    // Primeira volta: procurar, com o mecanismo nativo do fornecedor.
    const prose = await setup.provider.search({
      model: setup.models.chat,
      system: PROMPT,
      user: ask,
      maxTokens: 4000,
    });

    if (!prose.trim()) return { found: [], failure: 'A pesquisa não devolveu nada.' };

    // Segunda volta: arrumar em estrutura. Separado de propósito — pedir
    // pesquisa e JSON no mesmo turno costuma dar JSON pior, e nem todos os
    // fornecedores deixam combinar pesquisa com saída estruturada.
    const shaped = await setup.provider.structured({
      model: setup.models.fast,
      system: 'Extrais empresas do texto para o formato pedido. Não inventes nenhuma que não esteja lá.',
      user: prose.slice(0, 30000),
      schema: Found,
      jsonSchema: z.toJSONSchema(Found, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>,
      maxTokens: 4000,
    });

    const parsed = Found.safeParse(shaped.raw);
    if (!parsed.success) return { found: [], failure: 'Não consegui estruturar o resultado.' };

    const found = parsed.data.brands.flatMap((b): Discovered[] => {
      const normalizedName = normalizeName(b.name);
      if (!normalizedName) return [];
      return [
        {
          name: b.name.trim(),
          normalizedName,
          website: b.website,
          domain: normalizeDomain(b.website),
          country: b.country,
          description: b.description,
          why: b.why,
          source: b.source,
          nicheId: guessNiche(b.description, b.name)?.id ?? null,
        },
      ];
    });

    return { found, failure: null };
  } catch (error) {
    return { found: [], failure: error instanceof Error ? error.message : 'A descoberta falhou.' };
  }
}
