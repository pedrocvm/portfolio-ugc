'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SECTIONS, isCurrent, sectionFor } from './nav';
import { useExit } from './useExit';

const ICON = {
  content: (
    <>
      <path d="M5 5.4h14v13.2H5z" />
      <path d="m10 9.4 4.6 2.6-4.6 2.6z" />
    </>
  ),
  site: (
    <>
      <path d="M4.5 5.5h15v13h-15z" />
      <path d="M4.5 9h15M8 7.2h.1M10.5 7.2h.1" />
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

function Glyph({ name }: { name: keyof typeof ICON }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {ICON[name]}
    </svg>
  );
}

export default function MobileNav({
  onSignOut,
}: {
  onSignOut: React.ReactNode;
  /** Compatibilidade com a bancada antiga. A Carol AI global saiu do produto. */
  assistantEnabled?: boolean;
}) {
  const path = usePathname();
  const here = sectionFor(path);
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

  return (
    <>
      <nav className="tabbar" aria-label="Áreas">
        {SECTIONS.map((s) => (
          <Link
            key={s.id}
            href={s.href}
            aria-current={here?.id === s.id ? 'page' : undefined}
          >
            <Glyph name={s.id as 'content' | 'site'} />
            <span>{s.label}</span>
          </Link>
        ))}

        <button type="button" aria-expanded={open} onClick={() => setOpen(true)}>
          <Glyph name="more" />
          <span>Mais</span>
        </button>
      </nav>

      {open ? (
        <div className="sheet-more" data-closing={closing || undefined}>
          <button className="pickScrim" type="button" aria-label="Fechar" onClick={close} />
          <div className="moreBox" role="dialog" aria-modal="true" aria-label="Mais">
            <span className="moreGrab" aria-hidden="true" />

            {here?.items.length ? (
              <div className="moreGroup">
                <span className="moreLabel">{here.label}</span>
                <div className="moreList">
                  {here.items.map((m) => (
                    <Link
                      key={m.href}
                      href={m.href}
                      aria-current={isCurrent(path, m.href) ? 'page' : undefined}
                      onClick={close}
                    >
                      {m.label}
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="moreOut">{onSignOut}</div>
          </div>
        </div>
      ) : null}
    </>
  );
}
