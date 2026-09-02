/** A política de nicho é dado versionado, não uma frase dentro de um prompt.
 *  Se vivesse só no prompt, qualquer modelo com a ideia genérica de que
 *  «beleza vende bem em UGC» reintroduzia skincare pela porta das traseiras.
 *  Aqui está em código, com teste, e o motor de fit lê daqui. */

export const NICHE_POLICY_VERSION = 'niche-v1';

export type NicheTier = 'P0' | 'P1' | 'P2' | 'EXCLUDED';

export type Niche = {
  id: string;
  label: string;
  tier: NicheTier;
  /** Contributo para o critério de categoria do Fit Score, de 0 a 5. */
  fit: number;
  /** Se a descoberta e as sugestões podem propor esta categoria ativamente. */
  prospect: boolean;
  keywords: readonly string[];
};

export const NICHES: readonly Niche[] = [
  {
    id: 'saas',
    label: 'SaaS e software',
    tier: 'P0',
    fit: 5,
    prospect: true,
    keywords: ['saas', 'software', 'plataforma', 'platform', 'workflow', 'produtividade',
      'productivity', 'dashboard', 'crm', 'erp', 'b2b', 'ferramenta', 'tool', 'api'],
  },
  {
    id: 'apps',
    label: 'Apps e produtos digitais',
    tier: 'P0',
    fit: 5,
    prospect: true,
    keywords: ['app', 'aplicacao', 'aplicativo', 'mobile', 'ios', 'android', 'subscricao',
      'subscription', 'assinatura', 'digital', 'ebook', 'curso online'],
  },
  {
    id: 'consumer_tech',
    label: 'Consumer tech e gadgets',
    tier: 'P0',
    fit: 5,
    prospect: true,
    keywords: ['gadget', 'eletronico', 'electronico', 'electronics', 'acessorio tech',
      'wearable', 'smartwatch', 'auscultadores', 'headphones', 'powerbank', 'power bank',
      'carregador', 'charger', 'usb', 'camera', 'drone', 'tablet', 'monitor'],
  },
  {
    id: 'home_tech',
    label: 'Home tech, facilities e automação',
    tier: 'P0',
    fit: 5,
    prospect: true,
    keywords: ['smart home', 'domotica', 'automacao', 'robo', 'robot', 'aspirador',
      'limpeza', 'cleaning', 'iluminacao', 'lighting', 'climatizacao', 'ar condicionado',
      'seguranca', 'security', 'eletrodomestico', 'air fryer', 'purificador', 'facilities'],
  },
  {
    id: 'pet_tech',
    label: 'Pet tech',
    tier: 'P0',
    fit: 5,
    prospect: true,
    keywords: ['pet', 'gato', 'cat', 'cao', 'dog', 'areia', 'litter', 'comedouro', 'feeder',
      'bebedouro', 'fonte de agua', 'petcare', 'animal'],
  },
  {
    id: 'home_lifestyle',
    label: 'Casa e lifestyle',
    tier: 'P1',
    fit: 3,
    prospect: true,
    keywords: ['decoracao', 'decor', 'organizacao', 'mobiliario', 'furniture', 'planta',
      'aroma', 'difusor', 'casa', 'home', 'cozinha', 'kitchen'],
  },
  {
    id: 'fitness',
    label: 'Fitness',
    tier: 'P1',
    fit: 3,
    prospect: true,
    keywords: ['fitness', 'treino', 'workout', 'ginasio', 'gym', 'suplemento', 'proteina',
      'yoga', 'corrida', 'running'],
  },
  {
    id: 'food',
    label: 'Gastronomia e outros',
    tier: 'P2',
    fit: 2,
    prospect: false,
    keywords: ['gastronomia', 'food', 'comida', 'bebida', 'cafe', 'restaurante', 'snack'],
  },
  {
    id: 'other',
    label: 'Outro',
    tier: 'P2',
    fit: 2,
    prospect: false,
    keywords: [],
  },
  {
    id: 'beauty',
    label: 'Skincare e haircare',
    tier: 'EXCLUDED',
    fit: 0,
    prospect: false,
    keywords: ['skincare', 'skin care', 'serum', 'sérum', 'creme facial', 'haircare',
      'hair care', 'champo', 'shampoo', 'condicionador', 'cabelo', 'capilar', 'cosmetica',
      'cosmetic', 'beleza', 'beauty', 'maquilhagem', 'maquiagem', 'makeup'],
  },
];

const BY_ID = new Map(NICHES.map((n) => [n.id, n]));

export const nicheById = (id: string | null | undefined) =>
  (id ? BY_ID.get(id) : undefined) ?? BY_ID.get('other')!;

export const isExcludedNiche = (id: string | null | undefined) =>
  nicheById(id).tier === 'EXCLUDED';

/** Categorias que a descoberta e as sugestões podem propor por iniciativa
 *  própria. Skincare e haircare nunca entram aqui: podem existir como registro
 *  histórico, nunca como alvo. */
export const prospectableNiches = () => NICHES.filter((n) => n.prospect);

/** Acentos fora, pontuação vira espaço, e o resultado fica rodeado de espaços.
 *  Comparar por substring cru dava falsos positivos silenciosos: «api» está
 *  dentro de «rápida», e um power bank ia parar a SaaS. */
const tokenize = (v: string) =>
  ` ${v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `;

/** Adivinha a categoria a partir de texto livre — nome, descrição, produto.
 *  Devolve `null` quando nada bate, porque «não sei» é uma resposta válida e
 *  «other» aplicado por padrão esconde a diferença. */
export function guessNiche(...texts: (string | null | undefined)[]): Niche | null {
  const haystack = tokenize(texts.filter(Boolean).join(' '));
  if (haystack.trim() === '') return null;

  let best: { niche: Niche; hits: number } | null = null;
  for (const niche of NICHES) {
    let hits = 0;
    for (const kw of niche.keywords) {
      const term = tokenize(kw).slice(0, -1); // mantém o espaço da frente
      // O plural simples conta: «gatos» é o mesmo nicho que «gato».
      if (haystack.includes(`${term} `) || haystack.includes(`${term}s `)) hits++;
    }
    if (hits > 0 && (!best || hits > best.hits)) best = { niche, hits };
  }
  return best?.niche ?? null;
}

/** O nicho como se diz, não como se salva.
 *
 *  `home_tech` numa etiqueta é o sistema a falar com você próprio. Um nicho que
 *  não esteja na lista devolve null em vez de inventar: melhor uma etiqueta a
 *  menos do que uma etiqueta errada. */
export function nicheLabel(id: string | null | undefined): string | null {
  if (!id) return null;
  return NICHES.find((n) => n.id === id)?.label ?? null;
}

/** Uma etiqueta curta, para caber num cartão ao lado de outras. */
export function nicheShort(id: string | null | undefined): string | null {
  const full = nicheLabel(id);
  return full ? (full.split(/\s+e\s+|,\s*/)[0] ?? full) : null;
}
