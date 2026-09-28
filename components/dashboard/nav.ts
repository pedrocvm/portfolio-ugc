export type NavItem = {
  href: string;
  label: string;
  quiet?: boolean;
};

export type Section = {
  id: string;
  label: string;
  href: string;
  items: readonly NavItem[];
};

/** O CarolOS volta a ter somente o que a Carol usa agora.
 *
 * Conteúdo é o trabalho diário. O site continua porque é a única função antiga
 * que ela usa de verdade. CRM, prospecção, receita, inbox, produção de marcas e
 * restantes áreas saem da navegação e das rotas privadas nesta fatia. */
export const SECTIONS: readonly Section[] = [
  {
    id: 'content',
    label: 'Conteúdo',
    href: '/dashboard/content',
    items: [
      { href: '/dashboard/content', label: 'Semana' },
      { href: '/dashboard/content/map', label: 'Mapa' },
      { href: '/dashboard/content/production', label: 'Produção' },
    ],
  },
  {
    id: 'site',
    label: 'O site',
    href: '/dashboard/site',
    items: [
      { href: '/dashboard/site', label: 'Editar site' },
      { href: '/dashboard/site/library', label: 'Biblioteca' },
      { href: '/dashboard/site/links', label: 'Links' },
    ],
  },
] as const;

export const UTILITY: readonly NavItem[] = [];
export const EXTRA: readonly NavItem[] = [];

export const isCurrent = (path: string, href: string) =>
  href === '/dashboard' ? path === href : path === href || path.startsWith(`${href}/`);

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
