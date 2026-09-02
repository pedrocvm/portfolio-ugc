'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isCurrent, sectionFor } from './nav';

/** A barra da seção. Só existe quando há para onde ir dentro dela.
 *
 *  É aqui que vivem as sub-áreas que saíram do carril. As de operação ficam à
 *  vista; as que são base de conhecimento — marcas, clientes, documentos —
 *  ficam atrás do «mais», porque consultam-se de vez em quando e não competem
 *  com o que há para fazer agora.
 *
 *  O Hoje não tem barra nenhuma: não há sub-áreas, e uma barra com um item só
 *  é uma linha a dizer onde já se está. */
export default function SectionNav() {
  const path = usePathname();
  const section = sectionFor(path);
  if (!section || section.items.length === 0) return null;

  const loud = section.items.filter((i) => !i.quiet);
  const quiet = section.items.filter((i) => i.quiet);
  // Uma sub-área silenciosa aberta tem de se ver: senão a barra não diz onde se
  // está, e o «mais» fechado esconde a única pista.
  const openQuiet = quiet.find((i) => isCurrent(path, i.href));

  return (
    <nav className="secBar" aria-label={section.label}>
      <div className="secBarList">
        {loud.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            aria-current={isCurrent(path, i.href) ? 'page' : undefined}
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
                aria-current={isCurrent(path, i.href) ? 'page' : undefined}
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
