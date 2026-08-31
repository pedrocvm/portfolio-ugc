import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { assistantConfig } from '@/modules/assistant/config';
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
  const cfg = assistantConfig();
  if (!cfg.apiKey) return { found: [], failure: 'Falta ANTHROPIC_API_KEY.' };

  const ask = [
    `Nichos a procurar hoje: ${strategy.niches.join(', ')}.`,
    `Mercados: ${strategy.countries.join(', ')}.`,
    `Ângulo: ${strategy.angle}.`,
    extra ? `Pedido específico: ${extra}` : '',
    'Procura na web e devolve as empresas que encontrares.',
  ]
    .filter(Boolean)
    .join('\n');

  const client = new Anthropic({ apiKey: cfg.apiKey });

  try {
    // Primeira volta: procurar. O modelo usa a pesquisa do fornecedor.
    const search = await client.messages.create({
      model: cfg.models.chat,
      max_tokens: 4000,
      system: PROMPT,
      messages: [{ role: 'user', content: ask }],
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6 } as unknown as Anthropic.ToolUnion],
    });

    const prose = search.content
      .filter((c): c is Anthropic.TextBlock => c.type === 'text')
      .map((c) => c.text)
      .join('\n');

    if (!prose.trim()) return { found: [], failure: 'A pesquisa não devolveu nada.' };

    // Segunda volta: arrumar em estrutura. Separado de propósito — pedir
    // pesquisa e JSON no mesmo turno costuma dar JSON pior.
    const shaped = await client.messages.create({
      model: cfg.models.fast,
      max_tokens: 4000,
      system: 'Extrais empresas do texto para o formato pedido. Não inventes nenhuma que não esteja lá.',
      messages: [{ role: 'user', content: prose.slice(0, 30000) }],
      tools: [
        {
          name: 'brands_found',
          description: 'As empresas encontradas.',
          input_schema: z.toJSONSchema(Found, { io: 'input', unrepresentable: 'any' }) as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: 'tool', name: 'brands_found' },
    });

    const call = shaped.content.find((c): c is Anthropic.ToolUseBlock => c.type === 'tool_use');
    const parsed = Found.safeParse(call?.input);
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
