'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SECTIONS, UTILITY, isCurrent, sectionFor } from './nav';

/** O carril. Cinco seções e duas utilidades — e mais nada.
 *
 *  O acordeão saiu. Um acordeão é um menu que pede para ser operado antes de
 *  levar a algum lado: abrir o grupo, ler, escolher. Agora a seção é o
 *  destino, e o que está lá dentro só aparece depois de se lá estar. */
export default function Menu() {
  const path = usePathname();
  const here = sectionFor(path);

  return (
    <nav className="rail" id="rail" aria-label="Áreas">
      <div className="railMain">
        {SECTIONS.map((s, i) => (
          <Link
            key={s.id}
            href={s.href}
            aria-current={here?.id === s.id ? 'page' : undefined}
            style={{ '--r': i } as React.CSSProperties}
          >
            {s.label}
          </Link>
        ))}
      </div>

      <div className="railUtil">
        {UTILITY.map((u, i) => (
          <Link
            key={u.href}
            href={u.href}
            aria-current={isCurrent(path, u.href) ? 'page' : undefined}
            style={{ '--r': SECTIONS.length + i } as React.CSSProperties}
          >
            {u.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
