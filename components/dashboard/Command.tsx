'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ALL_DESTINATIONS } from './nav';
import { SECTIONS } from '@/lib/schema';
import { searchEverything, type Hit } from '@/app/dashboard/search-actions';
import { useExit } from './useExit';

type Item = { id: string; label: string; group: string; run: () => void };

const semAcento = (v: string) =>
  v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Ir a qualquer sítio, e encontrar qualquer coisa. Abre com Ctrl+K ou ⌘K.
 *
 *  Saltava só entre áreas do menu. Agora procura também marcas, negócios,
 *  pessoas, documentos e conteúdo — que é o que torna possível terem saído do
 *  primeiro nível da navegação: uma base de conhecimento não precisa de lugar
 *  no menu, precisa de forma de lá chegar.
 *
 *  Os destinos filtram-se no browser, sem ida ao servidor. O resto é uma
 *  leitura por pesquisa, atrasada para não disparar uma por tecla. */
export default function Command() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  // O resultado guarda o termo que o produziu. Sem isso era preciso um segundo
  // estado «a procurar» reposto dentro do efeito — e escrever estado no corpo
  // de um efeito é o que faz um render puxar outro.
  const [achado, setAchado] = useState<{ termo: string; hits: Hit[] }>({ termo: '', hits: [] });
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { closing, close } = useExit(() => setOpen(false), 180);

  const termo = q.trim();
  const podeProcurar = termo.length >= 2;
  const procurando = podeProcurar && achado.termo !== termo;

  // 180ms depois da última tecla. Escrever «Cecotec» são sete teclas e uma
  // leitura, não sete leituras.
  useEffect(() => {
    const alvo = q.trim();
    if (alvo.length < 2) return;
    let vivo = true;
    const t = setTimeout(async () => {
      const r = await searchEverything(alvo);
      if (vivo) setAchado({ termo: alvo, hits: r });
    }, 180);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [q]);

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
    const areas = ALL_DESTINATIONS.map((m) => ({
      id: m.href,
      label: m.label,
      group: 'Ir para',
      run: () => router.push(m.href),
    }));
    const secs = SECTIONS.map((s) => ({
      id: `s-${s.id}`,
      label: s.title,
      group: 'Seção do site',
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

  const encontrados = useMemo<Item[]>(() => {
    const t2 = q.trim();
    const t = semAcento(t2);
    const areas = t ? items.filter((i) => semAcento(i.label).includes(t)) : items;
    const doServidor = (podeProcurar && achado.termo === t2 ? achado.hits : []).map((h) => ({
      id: h.id,
      label: h.label,
      group: h.group,
      run: () => router.push(h.href),
    }));
    // O que ela procurou vem antes de para onde pode ir: quem escreve «Cecotec»
    // quer a Cecotec, não a área que por acaso tem essas letras.
    return [...doServidor, ...areas];
  }, [items, q, achado, podeProcurar, router]);

  const lista = encontrados;

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
            setAt((v) => Math.min(v + 1, lista.length - 1));
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            setAt((v) => Math.max(v - 1, 0));
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            pick(lista[at]);
          }
        }}
      >
        <input
          ref={input}
          type="text"
          value={q}
          placeholder="Procure uma marca, um negócio, ou uma área"
          aria-label="Procurar"
          onChange={(e) => {
            setQ(e.target.value);
            setAt(0);
          }}
        />
        {lista.length === 0 ? (
          <p className="cmdVazio">
            {procurando ? 'A procurar…' : 'Nada com esse nome.'}
          </p>
        ) : (
          <ul className="cmdList">
            {lista.map((i, k) => (
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
