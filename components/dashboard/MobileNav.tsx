'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GROUPS } from './Menu';
import { useExit } from './useExit';

/* Glifos próprios, na mesma grelha de 24 e com o mesmo traço. Uma biblioteca
   de ícones seria dependência nova e estes cinco não a justificam. */
const ICON = {
  content: (
    <>
      <path d="M5 4.6h9.2L19 9.4V19.4H5z" />
      <path d="M13.9 4.6v5h5" />
      <path d="M8.4 13h7.2M8.4 16.2h4.8" />
    </>
  ),
  library: (
    <>
      <rect x="3.4" y="6.6" width="13.6" height="10.4" rx="1.8" />
      <path d="M6.6 6.6V5.2h13.4a1 1 0 0 1 1 1v11.2" />
      <path d="m5.6 15 3.3-3 3 2.6 2.2-1.8 2.9 2.6" />
    </>
  ),
  brands: (
    <>
      <path d="M11.4 4.2H19a.9.9 0 0 1 .9.9v7.5L11 21.4 3.6 14z" />
      <circle cx="15.7" cy="8.4" r="1.5" />
    </>
  ),
  funnel: (
    <>
      <path d="M3.8 5.2h16.4l-6.3 7.6v6.4l-3.8 2v-8.4z" />
    </>
  ),
  more: (
    <>
      <circle cx="6" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="18" cy="12" r="1.4" />
    </>
  ),
};

const TABS = [
  { href: '/dashboard', label: 'Conteúdo', icon: 'content' as const },
  { href: '/dashboard/library', label: 'Biblioteca', icon: 'library' as const },
  { href: '/dashboard/brands', label: 'Marcas', icon: 'brands' as const },
  { href: '/dashboard/funnel', label: 'Funil', icon: 'funnel' as const },
];

function Glyph({ name }: { name: keyof typeof ICON }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {ICON[name]}
    </svg>
  );
}

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
            <Glyph name={t.icon} />
            <span>{t.label}</span>
          </Link>
        ))}
        <button
          type="button"
          aria-expanded={open}
          aria-current={noResto ? 'page' : undefined}
          onClick={() => setOpen(true)}
        >
          <Glyph name="more" />
          <span>Mais</span>
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
                <div className="moreList">
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
              </div>
            ))}
            <div className="moreOut">{onSignOut}</div>
          </div>
        </div>
      ) : null}
    </>
  );
}
