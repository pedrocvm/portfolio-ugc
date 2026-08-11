'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const GROUPS = [
  {
    group: 'O site',
    items: [
      { href: '/dashboard', label: 'Conteúdo' },
      { href: '/dashboard/library', label: 'Biblioteca' },
      { href: '/dashboard/links', label: 'Links' },
    ],
  },
  {
    group: 'Negócio',
    items: [
      { href: '/dashboard/brands', label: 'Marcas' },
      { href: '/dashboard/funnel', label: 'Funil' },
      { href: '/dashboard/proposals', label: 'Propostas' },
      { href: '/dashboard/contracts', label: 'Contratos' },
      { href: '/dashboard/clients', label: 'Clientes', soon: true },
    ],
  },
  {
    group: 'Conta',
    items: [{ href: '/dashboard/account', label: 'A minha conta' }],
  },
] as const;

export const MENU = GROUPS.flatMap((g) =>
  g.items.map((i) => ({ ...i, group: g.group, soon: 'soon' in i && i.soon })),
);

export default function Menu() {
  const path = usePathname();
  let n = 0;

  return (
    <nav className="rail" aria-label="Áreas">
      {GROUPS.map((g) => (
        <div className="railGroup" key={g.group}>
          <span className="railLabel">{g.group}</span>
          {g.items.map((m) => {
            const soon = 'soon' in m && m.soon;
            return (
              <Link
                key={m.href}
                href={m.href}
                aria-current={path === m.href ? 'page' : undefined}
                data-soon={soon || undefined}
                style={{ '--r': n++ } as React.CSSProperties}
              >
                {m.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
