/** A navegação do CarolOS, num sítio só.
 *
 *  Eram dezoito destinos no primeiro nível — dois fixos e cinco grupos que se
 *  abriam. Ler dezoito nomes para escolher um é trabalho, e quase todos os dias
 *  a escolha certa era a mesma: o Hoje.
 *
 *  Agora são cinco secções. As sub-áreas continuam a existir, com as mesmas
 *  rotas, mas só aparecem depois de se entrar na secção a que pertencem — é o
 *  `SectionNav` que as mostra. Nada foi apagado; foi arrumado por altura.
 *
 *  A Captura saiu do menu de propósito: passou a caber em qualquer sítio, pelo
 *  botão global e por colar na página. Uma tela que se tem de ir procurar não é
 *  captura rápida. */

export type NavItem = {
  href: string;
  label: string;
  /** Base de conhecimento em vez de operação: existe, consulta-se, mas não
   *  compete pela atenção na barra da secção. Vive atrás do «mais». */
  quiet?: boolean;
};

export type Section = {
  id: string;
  label: string;
  /** Para onde vai quem carrega na secção. É sempre a sub-área mais acionável,
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
    id: 'work',
    label: 'Trabalho',
    href: '/dashboard/inbox',
    items: [
      { href: '/dashboard/inbox', label: 'Conversas' },
      { href: '/dashboard/opportunities', label: 'Negócios' },
      { href: '/dashboard/followups', label: 'Follow-ups' },
      { href: '/dashboard/production', label: 'Produção' },
      { href: '/dashboard/content', label: 'Conteúdo', quiet: true },
      { href: '/dashboard/brands', label: 'Marcas', quiet: true },
      { href: '/dashboard/clients', label: 'Clientes', quiet: true },
      { href: '/dashboard/cases', label: 'Cases', quiet: true },
      { href: '/dashboard/documents', label: 'Documentos', quiet: true },
      { href: '/dashboard/funnel', label: 'Funil', quiet: true },
    ],
  },
  {
    id: 'prospecting',
    label: 'Prospecção',
    href: '/dashboard/outreach',
    items: [
      { href: '/dashboard/outreach', label: 'Prontas' },
      { href: '/dashboard/outreach/history', label: 'Histórico', quiet: true },
    ],
  },
  {
    id: 'money',
    label: 'Dinheiro',
    href: '/dashboard/revenue',
    items: [
      { href: '/dashboard/revenue', label: 'Receita' },
      { href: '/dashboard/analytics', label: 'Análise' },
    ],
  },
  {
    id: 'site',
    label: 'O site',
    href: '/dashboard/site',
    items: [
      { href: '/dashboard/site', label: 'Páginas' },
      { href: '/dashboard/site/library', label: 'Biblioteca' },
      { href: '/dashboard/site/links', label: 'Links' },
    ],
  },
] as const;

/** Fora das secções: não é trabalho dela, é manutenção do sistema. */
export const UTILITY: readonly NavItem[] = [
  { href: '/dashboard/settings', label: 'Definições' },
  { href: '/dashboard/account', label: 'A minha conta' },
] as const;

/** Rotas que respondem mas não pertencem a barra nenhuma: são sub-vistas de um
 *  ecrã que já as abre, ou restos anteriores ao CarolOS. Estão aqui nomeadas
 *  para a paleta de comandos as encontrar e o teste de portas não falhar por
 *  distração. */
export const EXTRA: readonly NavItem[] = [
  { href: '/dashboard/capture', label: 'Captura' },
] as const;

/** «/dashboard» só está ativo em si mesmo; as outras contam também os filhos,
 *  para uma oportunidade aberta manter a secção acesa. */
export const isCurrent = (path: string, href: string) =>
  href === '/dashboard' ? path === href : path === href || path.startsWith(`${href}/`);

/** A secção a que um caminho pertence.
 *
 *  A primeira que casa chega, porque nenhuma secção é prefixo de outra — o que
 *  o teste abaixo garante, para o dia em que alguém acrescentar uma que seja. O
 *  Hoje só ganha por igualdade exacta; com prefixo, apanhava tudo. */
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
