'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SECTIONS, sectionFor } from './nav';

const ICON = {
  content: (
    <>
      <path d="M5 5.4h14v13.2H5z" />
      <path d="m10 9.4 4.6 2.6-4.6 2.6z" />
    </>
  ),
  site: (
    <>
      <path d="M4.5 7.2h15v11.2h-15z" />
      <path d="M4.5 10.2h15M7.2 5.2v3.1M11 5.2v3.1" />
    </>
  ),
};

function Glyph({ name }: { name: keyof typeof ICON }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">{ICON[name]}</svg>;
}

export default function MobileNav({ onSignOut }: { onSignOut: React.ReactNode }) {
  const path = usePathname();
  const here = sectionFor(path);
  return (
    <nav className="tabbar" aria-label="Áreas">
      {SECTIONS.map((section) => (
        <Link key={section.id} href={section.href} aria-current={here?.id === section.id ? 'page' : undefined}>
          <Glyph name={section.id as keyof typeof ICON} />
          <span>{section.label}</span>
        </Link>
      ))}
      <div className="tabOut">{onSignOut}</div>
    </nav>
  );
}
