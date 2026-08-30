'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** A navegação põe à frente o que faz ou protege dinheiro. O editor do site
 *  continua a existir — deixou é de ser a primeira coisa que ela vê. */
export const GROUPS = [
  {
    group: 'Operação',
    items: [
      { href: '/dashboard', label: 'Hoje' },
      { href: '/dashboard/inbox', label: 'Inbox' },
      { href: '/dashboard/opportunities', label: 'Oportunidades' },
      { href: '/dashboard/followups', label: 'Follow-ups' },
      { href: '/dashboard/capture', label: 'Captura' },
    ],
  },
  {
    group: 'Relação',
    items: [
      { href: '/dashboard/brands', label: 'Marcas' },
      { href: '/dashboard/clients', label: 'Clientes' },
      { href: '/dashboard/documents', label: 'Documentos' },
    ],
  },
  {
    group: 'Trabalho',
    items: [
      { href: '/dashboard/production', label: 'Produção' },
      { href: '/dashboard/content', label: 'Conteúdo' },
      { href: '/dashboard/cases', label: 'Cases' },
    ],
  },
  {
    group: 'Dinheiro',
    items: [
      { href: '/dashboard/revenue', label: 'Receita' },
      { href: '/dashboard/analytics', label: 'Análise' },
    ],
  },
  {
    group: 'O site',
    items: [
      { href: '/dashboard/site', label: 'Conteúdo do site' },
      { href: '/dashboard/site/library', label: 'Biblioteca' },
      { href: '/dashboard/site/links', label: 'Links' },
    ],
  },
  {
    group: 'Conta',
    items: [
      { href: '/dashboard/settings', label: 'Definições' },
      { href: '/dashboard/account', label: 'A minha conta' },
    ],
  },
] as const;

export const MENU = GROUPS.flatMap((g) =>
  g.items.map((i) => ({ ...i, group: g.group, soon: 'soon' in i && i.soon })),
);

/** «/dashboard» só está activo em si mesmo; as outras rotas contam também os
 *  filhos, para uma oportunidade aberta manter «Oportunidades» aceso. */
const isCurrent = (path: string, href: string) =>
  href === '/dashboard' ? path === href : path === href || path.startsWith(`${href}/`);

export default function Menu() {
  const path = usePathname();
  let n = 0;

  return (
    <nav className="rail" id="rail" aria-label="Áreas">
      {GROUPS.map((g) => (
        <div className="railGroup" key={g.group}>
          <span className="railLabel">{g.group}</span>
          {g.items.map((m) => {
            const soon = 'soon' in m && m.soon;
            return (
              <Link
                key={m.href}
                href={m.href}
                aria-current={isCurrent(path, m.href) ? 'page' : undefined}
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
