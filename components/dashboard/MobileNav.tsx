'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GROUPS } from './Menu';
import { useExit } from './useExit';

/** No telemóvel a navegação desce para uma barra fixa. Só cabem quatro
 *  destinos com alvo de toque decente; o resto vive na folha do "Mais". */
const TABS = [
  { href: '/dashboard', label: 'Conteúdo' },
  { href: '/dashboard/library', label: 'Biblioteca' },
  { href: '/dashboard/brands', label: 'Marcas' },
  { href: '/dashboard/funnel', label: 'Funil' },
];

export default function MobileNav({ onSignOut }: { onSignOut: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const { closing, close } = useExit(() => setOpen(false), 260);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  const noResto = !TABS.some((t) => t.href === path);

  return (
    <>
      <nav className="tabbar" aria-label="Áreas">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={path === t.href ? 'page' : undefined}
          >
            {t.label}
          </Link>
        ))}
        <button
          type="button"
          aria-expanded={open}
          aria-current={noResto ? 'page' : undefined}
          onClick={() => setOpen(true)}
        >
          Mais
        </button>
      </nav>

      {open ? (
        <div className="sheet-more" data-closing={closing || undefined}>
          <button
            className="pickScrim"
            type="button"
            aria-label="Fechar"
            onClick={close}
          />
          <div className="moreBox" role="dialog" aria-modal="true" aria-label="Mais">
            <span className="moreGrab" aria-hidden="true" />
            {GROUPS.map((g) => (
              <div className="moreGroup" key={g.group}>
                <span className="moreLabel">{g.group}</span>
                {g.items.map((m) => (
                  <Link
                    key={m.href}
                    href={m.href}
                    aria-current={path === m.href ? 'page' : undefined}
                    data-soon={('soon' in m && m.soon) || undefined}
                    onClick={close}
                  >
                    {m.label}
                  </Link>
                ))}
              </div>
            ))}
            <div className="moreOut">{onSignOut}</div>
          </div>
        </div>
      ) : null}
    </>
  );
}
