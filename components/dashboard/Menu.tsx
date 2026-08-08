'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const MENU = [
  { href: '/dashboard', label: 'Site' },
  { href: '/dashboard/library', label: 'Biblioteca' },
  { href: '/dashboard/brands', label: 'Marcas' },
  { href: '/dashboard/funnel', label: 'Funil' },
  { href: '/dashboard/proposals', label: 'Propostas' },
  { href: '/dashboard/contracts', label: 'Contratos' },
  { href: '/dashboard/clients', label: 'Clientes', soon: true },
  { href: '/dashboard/account', label: 'Conta' },
];

export default function Menu() {
  const path = usePathname();
  return (
    <nav className="index" aria-label="Áreas">
      {MENU.map((m) => (
        <Link
          key={m.href}
          href={m.href}
          aria-current={path === m.href ? 'page' : undefined}
          data-soon={m.soon || undefined}
        >
          {m.label}
        </Link>
      ))}
    </nav>
  );
}
