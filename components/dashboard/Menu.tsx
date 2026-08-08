'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const MENU = [
  { href: '/dashboard', label: 'Conteúdo do site' },
  { href: '/dashboard/preview', label: 'Pré-visualização' },
  { href: '/dashboard/library', label: 'Biblioteca' },
  { href: '/dashboard/brands', label: 'Marcas' },
  { href: '/dashboard/funnel', label: 'Funil de vendas' },
  { href: '/dashboard/proposals', label: 'Propostas' },
  { href: '/dashboard/contracts', label: 'Contratos' },
  { href: '/dashboard/clients', label: 'Clientes', soon: true },
  { href: '/dashboard/account', label: 'A minha conta' },
];

export default function Menu() {
  const path = usePathname();
  return (
    <ul className="dashMenu">
      {MENU.map((m) => (
        <li key={m.href}>
          <Link
            href={m.href}
            aria-current={path === m.href ? 'page' : undefined}
          >
            {m.label}
            {m.soon ? <span className="soon">Em breve</span> : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
