'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import Spinner from '@/components/dashboard/Spinner';
import { audioUploadPath, tellStory } from '@/app/dashboard/content-brain-actions';
import HelpNote from './HelpNote';

/** Contar uma situação: falando ou escrevendo.
 *
 *  Áudio é a entrada principal, e no celular ocupa a metade de baixo da tela —
 *  é onde o polegar chega. Escrever é a alternativa, não o contrário.
 *
 *  `MediaRecorder` nativo, sem biblioteca: o browser escolhe o codec, e o que
 *  se guarda é o `contentType` real para se conseguir reproduzir e transcrever
 *  depois. Uma biblioteca de forma de onda seria peso para desenhar uma coisa
 *  que ninguém precisa de ver enquanto fala.
 *
 *  O que ela grava não se perde por causa de uma falha de transcrição: o áudio
 *  fica no bucket privado e há um «tentar de novo». */

const MAX_SECONDS = 600;

type Fase = 'idle' | 'recording' | 'uploading' | 'thinking' | 'error';

function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

export default function StoryCapture({
  question,
  help,
  lensId,
  onCaptured,
}: {
  question: string;
  help?: string;
  /** A direção por onde ela procurou, quando escolheu uma. Vai gravada na
   *  história: sem isso não dá para saber que porta a fez lembrar. */
  lensId?: string | null;
  onCaptured: (r: { storyId: string; facts: string[]; questions: string[] }) => void;
}) {
  const [fase, setFase] = useState<Fase>('idle');
  const [erro, setErro] = useState('');
  const [segundos, setSegundos] = useState(0);
  const [texto, setTexto] = useState('');
  const [escrevendo, setEscrevendo] = useState(false);
  const [pending, start] = useTransition();

  const recorder = useRef<MediaRecorder | null>(null);
  const pedacos = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const relogio = useRef<ReturnType<typeof setInterval> | null>(null);

  const pararRelogio = () => {
    if (relogio.current) clearInterval(relogio.current);
    relogio.current = null;
  };

  const soltarMicrofone = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  useEffect(() => () => {
    pararRelogio();
    soltarMicrofone();
  }, [soltarMicrofone]);

  const enviar = useCallback(
    (blob: Blob, mime: string) => {
      start(async () => {
        setFase('uploading');
        const caminho = await audioUploadPath(mime || 'audio/webm');
        if ('error' in caminho) {
          setErro(caminho.error);
          setFase('error');
          return;
        }
        const { error } = await supabaseBrowser()
          .storage.from('story-audio')
          .upload(caminho.path, blob, { contentType: mime || 'audio/webm', upsert: false });
        if (error) {
          setErro('Não consegui salvar o áudio. Tente de novo, ou escreva.');
          setFase('error');
          return;
        }

        setFase('thinking');
        const r = await tellStory({ audioPath: caminho.path, lensId });
        if ('error' in r) {
          setErro(r.error);
          setFase('error');
          return;
        }
        setFase('idle');
        onCaptured({ storyId: r.storyId, facts: r.facts, questions: r.questions });
      });
    },
    [onCaptured, lensId],
  );

  const gravar = async () => {
    setErro('');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = s;
      const mime = pickMime();
      const rec = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
      pedacos.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) pedacos.current.push(e.data);
      };
      rec.onstop = () => {
        soltarMicrofone();
        const tipo = rec.mimeType || mime || 'audio/webm';
        const blob = new Blob(pedacos.current, { type: tipo });
        if (blob.size < 1000) {
          setErro('Não ouvi nada. Tente de novo, ou escreva.');
          setFase('error');
          return;
        }
        enviar(blob, tipo);
      };
      recorder.current = rec;
      rec.start();
      setSegundos(0);
      setFase('recording');
      relogio.current = setInterval(() => {
        setSegundos((s2) => {
          if (s2 + 1 >= MAX_SECONDS) rec.stop();
          return s2 + 1;
        });
      }, 1000);
    } catch {
      setErro('Não consegui acessar o microfone. Você pode escrever.');
      setEscrevendo(true);
      setFase('idle');
    }
  };

  const parar = () => {
    pararRelogio();
    recorder.current?.stop();
  };

  const descartar = () => {
    pararRelogio();
    if (recorder.current?.state === 'recording') {
      recorder.current.onstop = () => soltarMicrofone();
      recorder.current.stop();
    }
    setFase('idle');
    setSegundos(0);
  };

  const enviarTexto = () => {
    const t = texto.trim();
    if (t.length < 10) {
      setErro('Conte um pouco mais: o que aconteceu, e o que veio depois.');
      return;
    }
    setErro('');
    start(async () => {
      setFase('thinking');
      const r = await tellStory({ text: t, lensId });
      if ('error' in r) {
        setErro(r.error);
        setFase('error');
        return;
      }
      setTexto('');
      setFase('idle');
      onCaptured({ storyId: r.storyId, facts: r.facts, questions: r.questions });
    });
  };

  const ocupado = fase === 'uploading' || fase === 'thinking' || pending;
  const relogioTexto = `${String(Math.floor(segundos / 60)).padStart(2, '0')}:${String(segundos % 60).padStart(2, '0')}`;

  return (
    <div className="cbCapture">
      <p className="cbQuestion">{question}</p>
      {help ? <p className="osNote">{help}</p> : null}

      {erro ? (
        <p className="osWarn" role="alert">
          {erro}
        </p>
      ) : null}

      {ocupado ? (
        <p className="cbBusy" aria-live="polite">
          <Spinner />
          {fase === 'uploading' ? 'Salvando o áudio…' : 'Ouvindo o que você contou…'}
        </p>
      ) : escrevendo ? (
        <div className="cbWrite">
          <label className="osField">
            <span>O que aconteceu</span>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={6}
              placeholder="Conte como contaria para uma amiga."
              autoFocus
            />
          </label>
          <div className="cbActs">
            <button className="osStart" type="button" onClick={enviarTexto}>
              Pronto
            </button>
            <button className="focusSkip" type="button" onClick={() => setEscrevendo(false)}>
              Prefiro falar
            </button>
          </div>
        </div>
      ) : fase === 'recording' ? (
        <div className="cbRec">
          <p className="cbTimer" aria-live="off">
            <span className="cbDot" aria-hidden="true" />
            {relogioTexto}
          </p>
          <div className="cbActs">
            <button className="osStart" type="button" onClick={parar}>
              Pronto
            </button>
            <button className="focusSkip" type="button" onClick={descartar}>
              Descartar
            </button>
          </div>
        </div>
      ) : (
        <div className="cbIdle">
          <button className="cbMic" type="button" onClick={gravar}>
            <span className="cbMicDot" aria-hidden="true" />
            Toque para contar
          </button>
          <button className="focusSkip" type="button" onClick={() => setEscrevendo(true)}>
            Prefiro escrever
          </button>
        </div>
      )}

      {ocupado ? null : (
        <HelpNote question="Por que estou fazendo isso?">
          <p>
            Porque o conteúdo nasce de uma coisa que aconteceu de verdade. Sem matéria-prima sua eu
            não tenho o que estruturar — e não invento uma situação para preencher o dia.
          </p>
          <p>
            Conte solto, fora de ordem, do jeito que sair. Organizar é a minha parte, e vem depois.
          </p>
        </HelpNote>
      )}
    </div>
  );
}
