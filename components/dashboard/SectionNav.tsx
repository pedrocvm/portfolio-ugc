'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isCurrent, sectionFor, type NavItem } from './nav';

/** Navegação interna das duas áreas atuais do CarolOS. */
export default function SectionNav() {
  const path = usePathname();
  const section = sectionFor(path);
  if (!section || section.items.length === 0) return null;

  const loud = section.items.filter((i) => !i.quiet);
  const quiet = section.items.filter((i) => i.quiet);
  const current = (item: NavItem) => item.exact ? path === item.href : isCurrent(path, item.href);
  const openQuiet = quiet.find(current);

  return (
    <nav className="secBar" aria-label={section.label}>
      <div className="secBarList">
        {loud.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            aria-current={current(i) ? 'page' : undefined}
          >
            {i.label}
          </Link>
        ))}

        {openQuiet ? (
          <Link href={openQuiet.href} aria-current="page">
            {openQuiet.label}
          </Link>
        ) : null}
      </div>

      {quiet.length ? (
        <details className="secMore">
          <summary aria-label="Mais nesta área">mais</summary>
          <div className="secMoreBox">
            {quiet.map((i) => (
              <Link
                key={i.href}
                href={i.href}
                aria-current={current(i) ? 'page' : undefined}
              >
                {i.label}
              </Link>
            ))}
          </div>
        </details>
      ) : null}
    </nav>
  );
}
