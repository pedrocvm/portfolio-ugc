'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Busy from './Busy';
import Spinner from './Spinner';
import { discardDraft, publishDraft, saveDraft } from '@/app/dashboard/actions';
import type { Content } from '@/lib/content';
import { SECTIONS } from '@/lib/schema';
import { Fields } from './Fields';
import PreviewFrame from './PreviewFrame';
import { setIn } from './paths';

type State = { tone: 'idle' | 'dirty' | 'ok' | 'bad'; text: string };

const CLEAN: State = { tone: 'idle', text: 'Sem alterações por guardar' };

export default function Editor({ initial }: { initial: Content }) {
  const [content, setContent] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [state, setState] = useState<State>(CLEAN);
  const [preview, setPreview] = useState(false);
  const [here, setHere] = useState(SECTIONS[0].id);
  const [pending, start] = useTransition();
  const router = useRouter();
  const sticky = useRef<HTMLDivElement>(null);
  const tocadas = useRef(new Set<string>());

  /* o título grande encolhe assim que se rola, como as barras de navegação
     do iOS: a sentinela no topo da folha diz quando isso acontece */
  useEffect(() => {
    const marca = document.querySelector('.topMark');
    const barra = sticky.current;
    if (!marca || !barra) return;
    const io = new IntersectionObserver(
      ([e]) => barra.toggleAttribute('data-stuck', !e.isIntersecting),
      { threshold: 1 },
    );
    io.observe(marca);
    return () => io.disconnect();
  }, []);

  /* o cabeçalho de cada secção encosta ao topo enquanto essa secção está em
     vista; a sentinela diz quando isso acontece, para o cabeçalho encolher */
  useEffect(() => {
    const cabecas = Array.from(
      document.querySelectorAll<HTMLElement>('.secHead'),
    );
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const cabeca = (e.target as HTMLElement).nextElementSibling;
          cabeca?.toggleAttribute('data-stuck', !e.isIntersecting);
        }
      },
      { rootMargin: `-${parseInt(getComputedStyle(document.documentElement).getPropertyValue('--stickyH')) || 132}px 0px 0px 0px`, threshold: 0 },
    );
    for (const c of cabecas) {
      const s = c.previousElementSibling;
      if (s?.classList.contains('secMark')) io.observe(s);
    }
    return () => io.disconnect();
  }, []);

  /* o índice da margem marca a secção em vista */
  useEffect(() => {
    const alvos = SECTIONS.map((s) => document.getElementById(`s-${s.id}`)).filter(
      (el): el is HTMLElement => !!el,
    );
    const io = new IntersectionObserver(
      (entries) => {
        const visivel = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visivel) setHere(visivel.target.id.replace('s-', ''));
      },
      { rootMargin: '-25% 0px -60% 0px' },
    );
    alvos.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  /* a barra pode passar a duas linhas conforme a largura: as âncoras das
     secções têm de parar debaixo dela, não atrás */
  useEffect(() => {
    const el = sticky.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      /* exatamente a altura da barra: qualquer folga deixa o conteúdo
         aparecer entre a barra e o cabeçalho da secção */
      document.documentElement.style.setProperty(
        '--stickyH',
        `${Math.round(e.contentRect.height)}px`,
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function change(path: string, value: unknown) {
    tocadas.current.add(path.split('.')[0]);
    setContent((c) => setIn(c, path, value));
    setDirty(true);
    setState({ tone: 'dirty', text: 'Alterações por guardar' });
  }

  function save() {
    /* só as secções mexidas seguem: o que esta janela não tocou fica como
       está na base, mesmo que aqui esteja desatualizado */
    const patch = Object.fromEntries(
      [...tocadas.current].map((k) => [k, (content as Record<string, unknown>)[k]]),
    );
    start(async () => {
      const r = await saveDraft(patch);
      if (r.error) return setState({ tone: 'bad', text: r.error });
      tocadas.current.clear();
      setDirty(false);
      setState({ tone: 'ok', text: 'Guardado. Ainda não está no site.' });
      /* sem router.refresh aqui: o rascunho já está no cliente, e esperar pela
         página inteira deixava o estado preso em "a processar" */
    });
  }

  function publish() {
    start(async () => {
      const r = await publishDraft();
      setState(
        r.error
          ? { tone: 'bad', text: r.error }
          : { tone: 'ok', text: 'Publicado. O site já mostra estas alterações.' },
      );
    });
  }

  function discard() {
    if (!confirm('Repor o rascunho com o que está publicado no site?')) return;
    start(async () => {
      const r = await discardDraft();
      if (r.error) return setState({ tone: 'bad', text: r.error });
      tocadas.current.clear();
      setDirty(false);
      setState(CLEAN);
      router.refresh();
    });
  }

  return (
    <>
      <i className="topMark" aria-hidden="true" />
      <Busy on={pending} />
      <div className="dashSticky" ref={sticky}>
      <div className="dashBar">
        <h1>Conteúdo do site</h1>
        <span className="dashState" data-tone={pending ? undefined : state.tone}>
          {pending ? <Spinner label="A guardar" /> : null}
          {pending ? 'A processar' : state.text}
        </span>
        <button
          type="button"
          className="btn quiet"
          onClick={discard}
          disabled={pending}
        >
          Repor
        </button>
        <button
          type="button"
          className="btn"
          onClick={save}
          disabled={pending || !dirty}
        >
          Guardar
        </button>
        <button
          type="button"
          className="btn solid"
          onClick={publish}
          disabled={pending || dirty}
          title={dirty ? 'Guarda as alterações antes de publicar.' : undefined}
        >
          Publicar
        </button>
      </div>

      </div>

      <button
        type="button"
        className="pvFab"
        onClick={() => setPreview(true)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M2.4 12S6 5.4 12 5.4 21.6 12 21.6 12 18 18.6 12 18.6 2.4 12 2.4 12Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <circle
            cx="12"
            cy="12"
            r="3.1"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
        </svg>
        Ver o site
      </button>

      {preview ? (
        <PreviewFrame
          content={content}
          dirty={dirty}
          onClose={() => setPreview(false)}
        />
      ) : null}

      <div className="withIndex">
        <div>
          {SECTIONS.map((s) => (
            <section className="sec" id={`s-${s.id}`} key={s.id}>
              <i className="secMark" aria-hidden="true" />
              <div className="secHead">
                <h2>{s.title}</h2>
                <p className="said">{s.note}</p>
              </div>
              <Fields
                fields={s.fields}
                ctx={{ root: content, base: '', onChange: change }}
              />
            </section>
          ))}
        </div>
        <nav className="secIndex" aria-label="Secções">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#s-${s.id}`}
              aria-current={here === s.id ? 'true' : undefined}
            >
              {s.title}
            </a>
          ))}
        </nav>
      </div>
    </>
  );
}
