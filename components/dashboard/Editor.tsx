'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { discardDraft, publishDraft, saveDraft } from '@/app/dashboard/actions';
import type { Content } from '@/lib/content';
import { SECTIONS } from '@/lib/schema';
import { Fields } from './Fields';
import { setIn } from './paths';

type State = { tone: 'idle' | 'dirty' | 'ok' | 'bad'; text: string };

const CLEAN: State = { tone: 'idle', text: 'Sem alterações por guardar' };

export default function Editor({ initial }: { initial: Content }) {
  const [content, setContent] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [state, setState] = useState<State>(CLEAN);
  const [pending, start] = useTransition();
  const router = useRouter();
  const sticky = useRef<HTMLDivElement>(null);

  /* a barra pode passar a duas linhas conforme a largura: as âncoras das
     secções têm de parar debaixo dela, não atrás */
  useEffect(() => {
    const el = sticky.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      document.documentElement.style.setProperty(
        '--stickyH',
        `${Math.round(e.contentRect.height) + 14}px`,
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
    setContent((c) => setIn(c, path, value));
    setDirty(true);
    setState({ tone: 'dirty', text: 'Alterações por guardar' });
  }

  function save() {
    start(async () => {
      const r = await saveDraft(content);
      if (r.error) return setState({ tone: 'bad', text: r.error });
      setDirty(false);
      setState({ tone: 'ok', text: 'Guardado. Ainda não está no site.' });
      router.refresh();
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
      setDirty(false);
      setState(CLEAN);
      router.refresh();
    });
  }

  return (
    <>
      <div className="dashSticky" ref={sticky}>
      <div className="dashBar">
        <h1>Conteúdo do site</h1>
        <span className="dashState" data-tone={state.tone}>
          {pending ? 'A processar…' : state.text}
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

      <nav className="secNav" aria-label="Secções">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#s-${s.id}`}>
            {s.title}
          </a>
        ))}
      </nav>
      </div>

      {SECTIONS.map((s) => (
        <section className="sec" id={`s-${s.id}`} key={s.id}>
          <div className="secHead">
            <span className="eyeb">Secção</span>
            <h2>{s.title}</h2>
            <p>{s.note}</p>
          </div>
          <Fields
            fields={s.fields}
            ctx={{ root: content, base: '', onChange: change }}
          />
        </section>
      ))}
    </>
  );
}
