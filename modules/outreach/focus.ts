/** O foco da busca automática, decidido por ela.
 *
 *  Os nichos estavam no código e os países numa lista fixa. Mudar o que o
 *  CarolOS procura de manhã era um commit — o que quer dizer que, na prática,
 *  não mudava. Isto é a parte pura: o que é um foco válido e o que acontece
 *  quando não há nenhum salvo. */

import { NICHES } from '@/modules/brands/niches';

export type FocusNiche = {
  /** O id de um nicho conhecido, ou um livre escrito por ela. */
  id: string;
  label: string;
  /** Favoritos saem primeiro e mais vezes. */
  favourite: boolean;
  /** O que procurar dentro deste nicho.
   *
   *  «Hotéis» é o rótulo; «que fazem parcerias em troca de estadia e contratam
   *  creators de forma fixa» é o que ela quer mesmo. Sem isto, um nicho é uma
   *  palavra e a descoberta traz o hotel genérico mais próximo. */
  note?: string;
};

export type Focus = {
  niches: FocusNiche[];
  countries: string[];
  perDay: number;
};

/** O tech-first continua sendo o ponto de partida — mas agora é um ponto de
 *  partida, e não uma lei. Skincare e haircare continuam fora, por decisão de
 *  produto e não por acidente de lista. */
export const DEFAULT_FOCUS: Focus = {
  niches: [
    { id: 'saas', label: 'SaaS e software', favourite: true },
    { id: 'apps', label: 'Apps e produtos digitais', favourite: true },
    { id: 'consumer_tech', label: 'Consumer tech e gadgets', favourite: false },
    { id: 'home_tech', label: 'Home tech, facilities e automação', favourite: false },
    { id: 'pet_tech', label: 'Pet tech', favourite: false },
  ],
  countries: ['Portugal'],
  perDay: 20,
};

export const MAX_NICHES = 12;
export const MAX_COUNTRIES = 4;

/** Um nicho escrito à mão vira um id estável, para não duplicar «Hotéis» e
 *  «hotéis» na lista dela. */
export const nicheIdFor = (label: string) =>
  label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);

/** Aceita o que veio da base ou do formulário e devolve um foco utilizável.
 *
 *  Nunca devolve vazio: uma lista de nichos vazia fazia a busca automática
 *  procurar tudo, que é o mesmo que procurar nada. */
export function normalizeFocus(input: Partial<Focus> | null | undefined): Focus {
  const vistos = new Set<string>();
  const niches = (input?.niches ?? [])
    .map((n) => ({
      id: nicheIdFor(n.id || n.label || ''),
      label: (n.label || n.id || '').trim().slice(0, 60),
      favourite: Boolean(n.favourite),
      // Um parágrafo cabe; um ensaio dilui o pedido e a descoberta perde o fio.
      note: n.note?.trim().slice(0, 400) || undefined,
    }))
    .filter((n) => n.id && n.label && !vistos.has(n.id) && vistos.add(n.id))
    .slice(0, MAX_NICHES);

  const paises = [...new Set((input?.countries ?? []).map((c) => c.trim()).filter(Boolean))]
    .slice(0, MAX_COUNTRIES);

  const perDay = Math.min(40, Math.max(1, Math.round(input?.perDay ?? DEFAULT_FOCUS.perDay)));

  return {
    niches: niches.length ? niches : DEFAULT_FOCUS.niches,
    countries: paises.length ? paises : DEFAULT_FOCUS.countries,
    perDay,
  };
}

/** A ordem em que os nichos são procurados: favoritos primeiro, e depois os
 *  outros por rotação, para nenhum ficar esquecido. */
export function nichesForDay(focus: Focus, day: number, quantos = 2): FocusNiche[] {
  const favoritos = focus.niches.filter((n) => n.favourite);
  const resto = focus.niches.filter((n) => !n.favourite);
  if (focus.niches.length <= quantos) return focus.niches;

  const escolhidos: FocusNiche[] = [];
  const pool = [...favoritos, ...resto];
  for (let i = 0; i < quantos && i < pool.length; i++) {
    // Os favoritos rodam entre si; os outros rodam no conjunto todo.
    const lista = i === 0 && favoritos.length ? favoritos : pool;
    const escolhido = lista[(day + i) % lista.length];
    if (!escolhidos.some((e) => e.id === escolhido.id)) escolhidos.push(escolhido);
  }
  return escolhidos.length ? escolhidos : pool.slice(0, quantos);
}

/** Os nichos que a lista de origem conhece, para o formulário sugerir. */
export const KNOWN_NICHES = NICHES.filter((n) => n.tier !== 'EXCLUDED').map((n) => ({
  id: n.id,
  label: n.label,
}));
