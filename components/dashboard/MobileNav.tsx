'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SECTIONS, UTILITY, isCurrent, sectionFor } from './nav';
import { useAssistant } from '@/components/assistant/AssistantProvider';
import { useExit } from './useExit';

/* Glifos próprios, na mesma grelha de 24 e com o mesmo traço. Uma biblioteca
   de ícones seria dependência nova e estes cinco não a justificam. */
const ICON = {
  today: (
    <>
      <path d="M4.6 6.4h14.8v13H4.6z" />
      <path d="M4.6 10.2h14.8M8.6 4.4v3.4M15.4 4.4v3.4" />
      <path d="m8.8 14.4 2 2 3.6-3.8" />
    </>
  ),
  work: (
    <>
      <path d="M3.6 12.6 6 5.4h12l2.4 7.2v6H3.6z" />
      <path d="M3.6 12.6h4.2l1.2 2.4h5.9l1.3-2.4h4.2" />
    </>
  ),
  prospecting: (
    <>
      <circle cx="10.8" cy="10.8" r="6.2" />
      <path d="m15.4 15.4 4 4" />
    </>
  ),
  ai: (
    <>
      <path d="M12 4.2 13.7 9l4.8 1.7-4.8 1.7L12 17.2 10.3 12.4 5.5 10.7 10.3 9z" />
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

/* No celular só cabem quatro mais o «Mais». São as quatro que ela usa em
   movimento: decidir o dia, ver o trabalho, ver quem apareceu, e perguntar.
   A captura saiu daqui porque passou a ser global — cola-se de qualquer lugar. */
const TABS = ['today', 'work', 'prospecting'] as const;

function Glyph({ name }: { name: keyof typeof ICON }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {ICON[name]}
    </svg>
  );
}

export default function MobileNav({
  onSignOut,
  assistantEnabled,
}: {
  onSignOut: React.ReactNode;
  assistantEnabled: boolean;
}) {
  const path = usePathname();
  const here = sectionFor(path);
  const [open, setOpen] = useState(false);
  const { closing, close } = useExit(() => setOpen(false), 260);
  const assistant = useAssistant();

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

  const tabs = TABS.map((id) => SECTIONS.find((s) => s.id === id)!);
  const rest = SECTIONS.filter((s) => !TABS.includes(s.id as (typeof TABS)[number]));
  const noResto = !tabs.some((t) => t.id === here?.id);

  return (
    <>
      <nav className="tabbar" aria-label="Áreas">
        {tabs.map((s) => (
          <Link
            key={s.id}
            href={s.href}
            aria-current={here?.id === s.id ? 'page' : undefined}
          >
            <Glyph name={s.id as keyof typeof ICON} />
            <span>{s.label}</span>
          </Link>
        ))}

        {assistantEnabled ? (
          <button
            type="button"
            aria-expanded={assistant.open}
            onClick={() => assistant.setOpen(true)}
          >
            <Glyph name="ai" />
            <span>Carol AI</span>
          </button>
        ) : null}

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

            {rest.map((s) => (
              <div className="moreGroup" key={s.id}>
                <span className="moreLabel">{s.label}</span>
                <div className="moreList">
                  {(s.items.length ? s.items : [{ href: s.href, label: s.label }]).map((m) => (
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
            ))}

            {/* As sub-áreas da seção onde ela está, para não ter de voltar ao
                topo só para mudar de vista. */}
            {here && here.items.length ? (
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

            <div className="moreGroup">
              <span className="moreLabel">Conta</span>
              <div className="moreList">
                {UTILITY.map((m) => (
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

            <div className="moreOut">{onSignOut}</div>
          </div>
        </div>
      ) : null}
    </>
  );
}
