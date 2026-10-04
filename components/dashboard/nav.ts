/** Navegação privada do CarolOS.
 *
 * A Carol usa duas coisas: a estratégia/produção de conteúdo e o gerenciador
 * do site público. Tudo o que existia como CRM, prospecção, inbox, dinheiro ou
 * operação comercial saiu da experiência. Se uma nova área não resolver um
 * uso real dela, não entra aqui. */

export type NavItem = {
  href: string;
  label: string;
  quiet?: boolean;
  exact?: boolean;
};

export type Section = {
  id: string;
  label: string;
  href: string;
  items: readonly NavItem[];
};

export const SECTIONS: readonly Section[] = [
  {
    id: 'content',
    label: 'Conteúdo',
    href: '/dashboard/content',
    items: [
      { href: '/dashboard/content', label: 'Calendário', exact: true },
      { href: '/dashboard/content/references', label: 'Referências' },
    ],
  },
  {
    id: 'site',
    label: 'O site',
    href: '/dashboard/site',
    items: [
      { href: '/dashboard/site', label: 'Editor', exact: true },
      { href: '/dashboard/site/library', label: 'Biblioteca' },
      { href: '/dashboard/site/links', label: 'Links' },
    ],
  },
] as const;

export const UTILITY: readonly NavItem[] = [];
export const EXTRA: readonly NavItem[] = [];

export const isCurrent = (path: string, href: string) =>
  path === href || path.startsWith(`${href}/`);

export function sectionFor(path: string): Section | null {
  return (
    SECTIONS.find((s) =>
      [s.href, ...s.items.map((i) => i.href)].some((href) => isCurrent(path, href)),
    ) ?? null
  );
}

export const ALL_DESTINATIONS: readonly NavItem[] = [
  ...SECTIONS.map((s) => ({ href: s.href, label: s.label })),
  ...SECTIONS.flatMap((s) => s.items),
].filter((item, i, all) => all.findIndex((o) => o.href === item.href) === i);
