'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MENU } from './Menu';
import { SECTIONS } from '@/lib/schema';
import { useExit } from './useExit';

type Item = { id: string; label: string; group: string; run: () => void };

const semAcento = (v: string) =>
  v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Salto rápido para qualquer área ou secção. Abre com Ctrl+K ou ⌘K. */
export default function Command() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { closing, close } = useExit(() => setOpen(false), 180);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
        setQ('');
        setAt(0);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const areas = MENU.filter((m) => !m.soon).map((m) => ({
      id: m.href,
      label: m.label,
      group: 'Ir para',
      run: () => router.push(m.href),
    }));
    const secs = SECTIONS.map((s) => ({
      id: `s-${s.id}`,
      label: s.title,
      group: 'Secção do site',
      run: () => {
        router.push('/dashboard');
        /* a rota renderiza depois do push: esperar pelo elemento em vez de
           assumir que já existe, senão o salto acontece na página antiga */
        const deadline = performance.now() + 2000;
        const tenta = () => {
          const el = document.getElementById(`s-${s.id}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
          }
          if (performance.now() < deadline) requestAnimationFrame(tenta);
        };
        requestAnimationFrame(tenta);
      },
    }));
    return [...areas, ...secs];
  }, [router]);

  const hits = useMemo(() => {
    const t = semAcento(q.trim());
    if (!t) return items;
    return items.filter((i) => semAcento(i.label).includes(t));
  }, [items, q]);

  if (!open) return null;

  function pick(item: Item | undefined) {
    if (!item) return;
    item.run();
    close();
  }

  return (
    <div className="cmd" data-closing={closing || undefined}>
      <button className="pickScrim" type="button" aria-label="Fechar" onClick={close} />
      <div
        className="cmdBox"
        role="dialog"
        aria-modal="true"
        aria-label="Ir para"
        onKeyDown={(e) => {
          if (e.key === 'Escape') close();
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setAt((v) => Math.min(v + 1, hits.length - 1));
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            setAt((v) => Math.max(v - 1, 0));
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            pick(hits[at]);
          }
        }}
      >
        <input
          ref={input}
          type="text"
          value={q}
          placeholder="Escreve para onde queres ir"
          aria-label="Procurar"
          onChange={(e) => {
            setQ(e.target.value);
            setAt(0);
          }}
        />
        {hits.length === 0 ? (
          <p className="cmdVazio">Nada com esse nome.</p>
        ) : (
          <ul className="cmdList">
            {hits.map((i, k) => (
              <li key={i.id}>
                <button
                  type="button"
                  data-at={k === at || undefined}
                  onMouseEnter={() => setAt(k)}
                  onClick={() => pick(i)}
                >
                  <span>{i.label}</span>
                  <span className="cmdGroup">{i.group}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
