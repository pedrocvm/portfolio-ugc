/** A navegação do CarolOS, num lugar só.
 *
 *  Seis seções, e cada uma é um trabalho dela — não uma tabela da base:
 *
 *    Hoje        o que precisa dela agora
 *    Conversas   quem falou e o que sai a seguir
 *    Marcas      a relação com cada marca, e onde procurar novas
 *    Conteúdo    o dela
 *    Produção    o das marcas, quando existe
 *    Dinheiro    o que entrou e o que falta
 *
 *  «Trabalho» era um saco com sete coisas; «Prospeção» era uma seção inteira
 *  para um lote que já chega pelo Hoje. As sub-áreas continuam existindo, com
 *  as mesmas rotas, mas aparecem só depois de se entrar na seção — e as que
 *  são base de conhecimento (clientes, cases, documentos, funil, análise)
 *  ficam atrás do «mais». O site é utilidade: edita-se de vez em quando.
 *
 *  A Captura saiu do menu de propósito: passou a caber em qualquer lugar, pelo
 *  botão global e por colar na página. */

export type NavItem = {
  href: string;
  label: string;
  /** Base de conhecimento em vez de operação: existe, consulta-se, mas não
   *  compete pela atenção na barra da seção. Vive atrás do «mais». */
  quiet?: boolean;
};

export type Section = {
  id: string;
  label: string;
  /** Para onde vai quem carrega na seção. É sempre a sub-área mais acionável,
   *  não uma página-índice: um índice é mais um clique para chegar ao mesmo. */
  href: string;
  items: readonly NavItem[];
};

export const SECTIONS: readonly Section[] = [
  {
    id: 'today',
    label: 'Hoje',
    href: '/dashboard',
    items: [],
  },
  {
    id: 'inbox',
    label: 'Conversas',
    href: '/dashboard/inbox',
    items: [
      { href: '/dashboard/inbox', label: 'Conversas' },
      { href: '/dashboard/followups', label: 'Follow-ups', quiet: true },
    ],
  },
  {
    id: 'brands',
    label: 'Marcas',
    href: '/dashboard/brands',
    items: [
      { href: '/dashboard/brands', label: 'Marcas' },
      { href: '/dashboard/opportunities', label: 'Negócios' },
      { href: '/dashboard/outreach', label: 'Prospeção' },
      { href: '/dashboard/outreach/history', label: 'Histórico', quiet: true },
      { href: '/dashboard/clients', label: 'Clientes', quiet: true },
      { href: '/dashboard/cases', label: 'Cases', quiet: true },
      { href: '/dashboard/documents', label: 'Documentos', quiet: true },
      { href: '/dashboard/funnel', label: 'Funil', quiet: true },
    ],
  },
  {
    id: 'content',
    label: 'Conteúdo',
    href: '/dashboard/content',
    items: [],
  },
  {
    id: 'production',
    label: 'Produção',
    href: '/dashboard/production',
    items: [],
  },
  {
    id: 'money',
    label: 'Dinheiro',
    href: '/dashboard/revenue',
    items: [
      { href: '/dashboard/revenue', label: 'Receita' },
      { href: '/dashboard/analytics', label: 'Análise', quiet: true },
    ],
  },
] as const;

/** Fora das seções: não é o trabalho de todos os dias. O site edita-se de vez
 *  em quando; o resto é manutenção do sistema. */
export const UTILITY: readonly NavItem[] = [
  { href: '/dashboard/site', label: 'O site' },
  { href: '/dashboard/settings', label: 'Definições' },
  { href: '/dashboard/account', label: 'A minha conta' },
] as const;

/** Rotas que respondem mas não pertencem a barra nenhuma: são sub-vistas de
 *  uma tela que já as abre, ou restos anteriores ao CarolOS. Estão aqui
 *  nomeadas para a paleta de comandos as encontrar e o teste de portas não
 *  falhar por distração. */
export const EXTRA: readonly NavItem[] = [
  { href: '/dashboard/capture', label: 'Captura' },
  { href: '/dashboard/site/library', label: 'Biblioteca do site' },
  { href: '/dashboard/site/links', label: 'Links do site' },
] as const;

/** «/dashboard» só está ativo em si mesmo; as outras contam também os filhos,
 *  para uma oportunidade aberta manter a seção acesa. */
export const isCurrent = (path: string, href: string) =>
  href === '/dashboard' ? path === href : path === href || path.startsWith(`${href}/`);

/** A seção a que um caminho pertence.
 *
 *  A primeira que casa chega, porque nenhuma seção é prefixo de outra — o que
 *  o teste abaixo garante, para o dia em que alguém acrescentar uma que seja. O
 *  Hoje só ganha por igualdade exata; com prefixo, apanhava tudo. */
export function sectionFor(path: string): Section | null {
  return (
    SECTIONS.find((s) =>
      [s.href, ...s.items.map((i) => i.href)].some((href) => isCurrent(path, href)),
    ) ?? null
  );
}

/** Tudo o que a paleta de comandos consegue alcançar. */
export const ALL_DESTINATIONS: readonly NavItem[] = [
  ...SECTIONS.map((s) => ({ href: s.href, label: s.label })),
  ...SECTIONS.flatMap((s) => s.items),
  ...UTILITY,
  ...EXTRA,
].filter((item, i, all) => all.findIndex((o) => o.href === item.href) === i);
