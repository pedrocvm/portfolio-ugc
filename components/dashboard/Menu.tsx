'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Duas coisas estão sempre à mão, e são as duas pontas do dia dela: ler o que
 *  há para fazer, e meter cá dentro o que chegou por fora. O resto vive
 *  dobrado.
 *
 *  Eram dezoito destinos abertos ao mesmo tempo — mais alto do que qualquer
 *  ecrã, e a barra transbordava. */
export const PINNED = [
  { href: '/dashboard', label: 'Hoje' },
  { href: '/dashboard/capture', label: 'Captura' },
] as const;

export const GROUPS = [
  {
    group: 'Negócio',
    items: [
      { href: '/dashboard/inbox', label: 'Inbox' },
      { href: '/dashboard/opportunities', label: 'Oportunidades' },
      { href: '/dashboard/followups', label: 'Follow-ups' },
      { href: '/dashboard/brands', label: 'Marcas' },
      { href: '/dashboard/clients', label: 'Clientes' },
    ],
  },
  {
    group: 'Trabalho',
    items: [
      { href: '/dashboard/production', label: 'Produção' },
      { href: '/dashboard/content', label: 'Conteúdo' },
      { href: '/dashboard/documents', label: 'Documentos' },
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

/** A paleta de comandos procura em tudo, dobrado ou não. */
export const MENU = [
  ...PINNED.map((i) => ({ ...i, group: 'Operação', soon: false })),
  ...GROUPS.flatMap((g) =>
    g.items.map((i) => ({ ...i, group: g.group, soon: 'soon' in i && i.soon })),
  ),
];

/** «/dashboard» só está activo em si mesmo; as outras rotas contam também os
 *  filhos, para uma oportunidade aberta manter «Oportunidades» aceso. */
const isCurrent = (path: string, href: string) =>
  href === '/dashboard' ? path === href : path === href || path.startsWith(`${href}/`);

export default function Menu() {
  const path = usePathname();
  let n = 0;

  return (
    <nav className="rail" id="rail" aria-label="Áreas">
      <div className="railPin">
        {PINNED.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            aria-current={isCurrent(path, m.href) ? 'page' : undefined}
            style={{ '--r': n++ } as React.CSSProperties}
          >
            {m.label}
          </Link>
        ))}
      </div>

      {GROUPS.map((g) => (
        <details
          className="railGroup"
          key={g.group}
          open={g.items.some((m) => isCurrent(path, m.href))}
        >
          <summary className="railLabel">{g.group}</summary>
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
        </details>
      ))}
    </nav>
  );
}
