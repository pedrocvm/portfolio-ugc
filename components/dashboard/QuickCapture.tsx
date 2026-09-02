'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { capture, uploadScreenshot } from '@/app/dashboard/carolos-actions';
import { detectKind, type Guess } from '@/modules/capture/detect';
import Spinner from '@/components/dashboard/Spinner';
import { pushToast } from './Toasts';
import { useExit } from './useExit';

/** Captura de qualquer lugar.
 *
 *  Havia uma tela chamada «Captura», e uma tela que se tem de ir procurar não é
 *  captura rápida — quando ela está olhando para uma marca no celular, o
 *  caminho até lá é o custo todo. Saiu do menu e passou a viver aqui: um botão
 *  em todas as telas, e colar em qualquer lado abre isto já com o conteúdo
 *  dentro.
 *
 *  E deixou de perguntar o tipo. Eram sete botões — Link, Conversa, Perfil,
 *  Produto, Briefing, Print, Outro — e essa é uma decisão do sistema, que
 *  acerta quase sempre. Diz o que percebeu, em vez de perguntar, e quem
 *  discordar carrega em «não é isso». */

const TIPOS = [
  { id: 'url', label: 'Um link' },
  { id: 'conversation', label: 'Uma conversa' },
  { id: 'profile', label: 'Um perfil' },
  { id: 'product', label: 'Um produto' },
  { id: 'brief', label: 'Um briefing' },
  { id: 'screenshot', label: 'Um print' },
  { id: 'text', label: 'Outra coisa' },
] as const;

/** Colar dentro de uma caixa de texto é escrever, não capturar. */
function aEscrever(el: EventTarget | null) {
  const node = el as HTMLElement | null;
  if (!node?.tagName) return false;
  return (
    node.tagName === 'INPUT' ||
    node.tagName === 'TEXTAREA' ||
    node.isContentEditable
  );
}

export default function QuickCapture() {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState('');
  const [nota, setNota] = useState('');
  const [arquivo, setFicheiro] = useState<{ name: string; path: string } | null>(null);
  const [manual, setManual] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const [pending, start] = useTransition();
  const [aSubir, setASubir] = useState(false);
  const { closing, close } = useExit(() => setOpen(false), 220);
  const campo = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  const palpite: Guess = detectKind(raw, arquivo?.name ?? null);
  const tipo = manual ?? palpite.kind;

  const abrir = useCallback((texto?: string) => {
    if (texto) setRaw(texto);
    setErro('');
    setOpen(true);
  }, []);

  const subir = useCallback(async (file: File) => {
    setASubir(true);
    setErro('');
    const form = new FormData();
    form.set('file', file);
    const r = await uploadScreenshot(form);
    setASubir(false);
    if (r.error || !r.path) setErro(r.error ?? 'Não consegui salvar a imagem.');
    else setFicheiro({ name: file.name, path: r.path });
  }, []);

  // Colar em qualquer lado. É o gesto que ela já faz — o que faltava era ele
  // levar a algum lado.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (open || aEscrever(e.target)) return;
      const img = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'));
      if (img) {
        const file = img.getAsFile();
        if (file) {
          abrir();
          void subir(file);
          return;
        }
      }
      const texto = e.clipboardData?.getData('text')?.trim();
      if (texto) abrir(texto);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) close();
    };
    document.addEventListener('paste', onPaste);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, abrir, subir, close]);

  useEffect(() => {
    if (open) campo.current?.focus();
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const salvar = () =>
    start(async () => {
      setErro('');
      const r = await capture(tipo, raw.trim(), nota.trim(), arquivo?.path ?? null);
      if (r.error) {
        setErro(r.error);
        return;
      }
      setRaw('');
      setNota('');
      setFicheiro(null);
      setManual(null);
      close();
      pushToast('Salvo. Vou ver o que com você entender.', 'ok', '/dashboard/capture');
      router.refresh();
    });

  const podeGuardar = Boolean(raw.trim() || arquivo);

  return (
    <>
      <button
        className="capFab"
        type="button"
        aria-label="Capturar alguma coisa"
        onClick={() => abrir()}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 5.5v13M5.5 12h13" />
        </svg>
      </button>

      {open ? (
        <div className="focus capWrap" data-closing={closing || undefined}>
          <button className="pickScrim" type="button" aria-label="Fechar" onClick={close} />
          <div
            className="focusBox capBox"
            role="dialog"
            aria-modal="true"
            aria-label="Capturar"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file?.type.startsWith('image/')) void subir(file);
            }}
          >
            <header className="focusTop">
              <span className="focusAt">Salvar para o CarolOS</span>
              <button type="button" onClick={close} aria-label="Fechar">
                ×
              </button>
            </header>

            <label className="visually-hidden" htmlFor="capRaw">
              O que quer salvar
            </label>
            <textarea
              id="capRaw"
              ref={campo}
              rows={6}
              className="capField"
              placeholder="Cole aqui um link, uma conversa, um briefing — ou arraste um print."
              value={raw}
              onChange={(e) => {
                setRaw(e.target.value);
                setManual(null);
              }}
            />

            {arquivo ? (
              <p className="capFile">
                {arquivo.name}
                <button type="button" onClick={() => setFicheiro(null)}>
                  tirar
                </button>
              </p>
            ) : null}
            {aSubir ? (
              <p className="capFile">
                <Spinner label="Salvando a imagem" />Salvando a imagem…
              </p>
            ) : null}

            {/* O palpite dito em voz alta, em vez de sete botões a perguntar. */}
            {podeGuardar ? (
              <div className="capGuess">
                {manual ? (
                  <span>
                    Vou salvar como <b>{TIPOS.find((t) => t.id === manual)?.label.toLowerCase()}</b>.
                  </span>
                ) : (
                  <span>
                    Percebi <b>{palpite.label}</b>.
                  </span>
                )}
                <details className="capOther">
                  <summary>não é isso</summary>
                  <div className="capOtherBox">
                    {TIPOS.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        aria-pressed={t.id === tipo}
                        onClick={() => setManual(t.id)}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </details>
              </div>
            ) : null}

            <label className="visually-hidden" htmlFor="capNote">
              Alguma coisa que eu deva saber
            </label>
            <input
              id="capNote"
              className="capNote"
              placeholder="Alguma coisa que eu deva saber? (opcional)"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
            />

            {erro ? (
              <p className="osWarn" role="alert">
                {erro}
              </p>
            ) : null}

            <div className="focusActs">
              <button
                className="osGo"
                type="button"
                disabled={pending || aSubir || !podeGuardar}
                onClick={salvar}
              >
                {pending ? <Spinner label="Salvando" /> : null}
                Salvar
              </button>
              <button className="focusSkip" type="button" onClick={close}>
                Deixa estar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
