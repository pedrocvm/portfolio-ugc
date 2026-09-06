'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import Spinner from '@/components/dashboard/Spinner';
import { useExit } from '@/components/dashboard/useExit';
import {
  askForFraming,
  chooseStoryPoint,
  confirmStoryFacts,
  findStoryFunction,
  markReadyToRecord,
  markStoryPrivate,
  saveStoryMeaning,
  structureThisStory,
  writeScript,
} from '@/app/dashboard/content-brain-actions';
import { classifyStoryDirection } from '@/app/dashboard/content-brain-actions';
import type { FunctionalPillar } from '@/modules/content-brain/domain';
import HelpNote from './HelpNote';
import LensPicker from './LensPicker';
import StoryCapture from './StoryCapture';

/** O Story Workshop.
 *
 *  A ordem é a que a Source of Truth define e não se salta:
 *
 *    direção → contar → confirmar os fatos → o ponto → a estrutura → (roteiro)
 *
 *  A direção é o degrau que faltava. «Me conte uma situação real» é abstrato
 *  demais: primeiro escolhe-se ONDE procurar na memória. Quem já sabe o que
 *  quer contar salta — não se obriga ninguém a atravessar um assistente.
 *
 *  O roteiro é a última etapa e é opcional. O botão nem existe antes de haver
 *  estrutura — e se alguém chamar a action à mão, ela recusa na mesma. A
 *  proibição vive no domínio; isto só a reflete.
 *
 *  Uma etapa por tela. Fechar a meio não apaga nada: a história já está
 *  salva desde a primeira frase. */

type Etapa = 'lens' | 'capture' | 'facts' | 'meaning' | 'point' | 'structure' | 'done';

export type WorkshopStory = {
  id: string;
  title: string;
  facts: string[];
  meaning: string | null;
  pillar: FunctionalPillar | null;
  frameLabel: string | null;
  hasStructure: boolean;
  factConfirmed: boolean;
};

const PILLAR_LABEL: Record<FunctionalPillar, string> = {
  attraction_journey: 'Atração',
  information_retention: 'Informação e craft',
  authority_conversion: 'Prova e autoridade',
  connection_personal: 'Conexão',
};

export default function StoryWorkshop({
  story,
  focus,
  question,
  help,
  trigger,
  autoOpen,
  onClose,
}: {
  story?: WorkshopStory;
  focus: FunctionalPillar;
  question?: string;
  help?: string;
  /** Ausente quando quem abre é outra tela — o guia abre o Workshop já aberto,
   *  e um botão solto por baixo do modal não pertence a lado nenhum. */
  trigger?: string;
  /** O Hoje manda-a para aqui já a procurar. Abrir sozinho evita o clique a
   *  mais entre «encontrar uma história» e as direções. */
  autoOpen?: boolean;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(Boolean(autoOpen));
  const { closing, close } = useExit(() => {
    setOpen(false);
    onClose?.();
  }, 340);

  // Uma história que já existe entra onde parou. Uma nova começa pela direção.
  const [etapa, setEtapa] = useState<Etapa>(story ? (story.factConfirmed ? 'point' : 'facts') : 'lens');
  const [lente, setLente] = useState<{ id: string; label: string; question: string } | null>(null);
  const [storyId, setStoryId] = useState(story?.id ?? '');
  const [fatos, setFatos] = useState<string[]>(story?.facts ?? []);
  const [perguntas, setPerguntas] = useState<string[]>([]);
  const [significado, setSignificado] = useState(story?.meaning ?? '');
  const [opcoes, setOpcoes] = useState<{ id: string; label: string; because: string }[]>([]);
  const [pontoProprio, setPontoProprio] = useState('');
  const [resumo, setResumo] = useState<{ beats: number; suggestions: number } | null>(null);
  const [roteiro, setRoteiro] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const [pending, start] = useTransition();
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    caixa.current?.focus();
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  const capturada = useCallback(
    (r: { storyId: string; facts: string[]; questions: string[] }) => {
      setStoryId(r.storyId);
      setFatos(r.facts);
      setPerguntas(r.questions);
      setErro('');
      // Ela chegou já sabendo o que contar: classifica-se a direção depois, em
      // segundo plano, e fica gravada como inferência — nunca como escolha.
      if (!lente) void classifyStoryDirection(r.storyId);
      // Sem fatos extraídos (transcrição falhou, IA indisponível) a história fica
      // salva e ela vê isso escrito, em vez de uma tela vazia.
      setEtapa(r.facts.length ? 'facts' : 'done');
    },
    [lente],
  );

  const confirmar = () => {
    setErro('');
    start(async () => {
      const r = await confirmStoryFacts({ storyId, facts: fatos, meaning: significado || null });
      if ('error' in r) return setErro(r.error);
      setEtapa(significado ? 'point' : 'meaning');
    });
  };

  const guardarSignificado = () => {
    setErro('');
    start(async () => {
      if (significado.trim()) {
        const s = await saveStoryMeaning(storyId, significado.trim());
        if ('error' in s) return setErro(s.error);
      }
      const f = await findStoryFunction(storyId, focus);
      if ('error' in f) return setErro(f.error);
      setEtapa('point');
    });
  };

  const pedirPontos = () => {
    setErro('');
    start(async () => {
      const r = await askForFraming(storyId);
      if ('error' in r) return setErro(r.error);
      setOpcoes(r.options);
    });
  };

  const escolherPonto = (id: string, label?: string) => {
    setErro('');
    start(async () => {
      const r = await chooseStoryPoint(storyId, id, label);
      if ('error' in r) return setErro(r.error);
      const e = await structureThisStory(storyId);
      if ('error' in e) return setErro(e.error);
      setResumo({ beats: e.beats, suggestions: e.suggestions });
      setEtapa('structure');
    });
  };

  const pedirRoteiro = () => {
    setErro('');
    start(async () => {
      const r = await writeScript(storyId);
      if ('error' in r) return setErro(r.error);
      setRoteiro(r.script);
    });
  };

  const prontaParaGravar = () => {
    setErro('');
    start(async () => {
      const r = await markReadyToRecord(storyId);
      if ('error' in r) return setErro(r.error);
      setEtapa('done');
    });
  };

  const privada = () => {
    start(async () => {
      await markStoryPrivate(storyId, 'private');
      close();
    });
  };

  const passo = ['lens', 'capture', 'facts', 'meaning', 'point', 'structure'].indexOf(etapa) + 1;

  return (
    <>
      {trigger ? (
        <button className="osStart" type="button" onClick={() => setOpen(true)}>
          {trigger}
        </button>
      ) : null}

      {open ? (
        <div className="cbShop" data-closing={closing || undefined}>
          <div className="cbShopBox" role="dialog" aria-modal="true" aria-label="História" tabIndex={-1} ref={caixa}>
            <header className="cbShopTop">
              <span className="cbStep">
                {etapa === 'done' ? 'Salvo' : `${passo} de 6 · ${PILLAR_LABEL[focus]}`}
              </span>
              <button type="button" onClick={close} aria-label="Fechar">
                ×
              </button>
            </header>

            {erro ? (
              <p className="osWarn" role="alert">
                {erro}
              </p>
            ) : null}

            {pending ? (
              <p className="cbBusy" aria-live="polite">
                <Spinner />
                Um segundo…
              </p>
            ) : null}

            {etapa === 'lens' ? (
              <LensPicker
                pillar={focus}
                pillarLabel={PILLAR_LABEL[focus]}
                onPicked={(l) => {
                  setLente(l);
                  setEtapa('capture');
                }}
                onSkip={() => setEtapa('capture')}
              />
            ) : null}

            {etapa === 'capture' ? (
              <StoryCapture
                lensId={lente?.id ?? null}
                question={
                  // A pergunta da direção escolhida. Sem direção — ela já sabia
                  // o que contar — fica a pergunta aberta, que aqui é a certa.
                  lente?.question ??
                  question ??
                  'Aconteceu alguma coisa nos últimos dias que fez você rir, te irritou, te surpreendeu ou mudou alguma coisa?'
                }
                help={lente ? `Procurando por: ${lente.label.toLowerCase()}.` : (help ?? 'Pode ser bom, ruim, estranho ou pequeno.')}
                onCaptured={capturada}
              />
            ) : null}

            {etapa === 'facts' ? (
              <div className="cbStage">
                <h2>Foi isso que aconteceu?</h2>
                <p className="osNote">Se alguma coisa não está certa, corrija aqui antes de continuarmos.</p>

                <ul className="cbFacts">
                  {fatos.map((f, i) => (
                    <li key={i}>
                      <textarea
                        value={f}
                        rows={2}
                        aria-label={`Fato ${i + 1}`}
                        onChange={(e) => setFatos(fatos.map((x, j) => (j === i ? e.target.value : x)))}
                      />
                      <button
                        type="button"
                        className="cbDrop"
                        aria-label={`Tirar o fato ${i + 1}`}
                        onClick={() => setFatos(fatos.filter((_, j) => j !== i))}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
                <button className="chip" type="button" onClick={() => setFatos([...fatos, ''])}>
                  Faltou uma coisa
                </button>

                {perguntas.length ? (
                  <p className="cbAsk">{perguntas[0]}</p>
                ) : null}

                <HelpNote question="Por que preciso confirmar?">
                  <p>
                    Porque o CarolOS só pode estruturar conteúdo pessoal a partir de algo que
                    realmente aconteceu.
                  </p>
                  <p>
                    Enquanto você não disser que foi isso, eu não escolho ponto, não monto
                    estrutura e não escrevo nada. Corrigir aqui é mais barato do que descobrir na
                    gravação.
                  </p>
                </HelpNote>

                <div className="cbActs">
                  <button className="osStart" type="button" onClick={confirmar} disabled={pending || fatos.filter((f) => f.trim()).length === 0}>
                    Sim, foi isso
                  </button>
                  <button className="focusSkip" type="button" onClick={privada}>
                    Isso é privado
                  </button>
                </div>
              </div>
            ) : null}

            {etapa === 'meaning' ? (
              <div className="cbStage">
                <h2>O que mais ficou com você nessa história?</h2>
                <p className="osNote">Com as suas palavras. É isso que vai dar a voz do conteúdo.</p>
                <label className="osField">
                  <span className="cbHidden">O que ficou contigo</span>
                  <textarea value={significado} onChange={(e) => setSignificado(e.target.value)} rows={4} autoFocus />
                </label>
                <div className="cbActs">
                  <button className="osStart" type="button" onClick={guardarSignificado} disabled={pending}>
                    Continuar
                  </button>
                  <button className="focusSkip" type="button" onClick={() => setEtapa('point')}>
                    Não sei ainda
                  </button>
                </div>
              </div>
            ) : null}

            {etapa === 'point' ? (
              <div className="cbStage">
                <h2>Qual é a parte que você realmente quer contar?</h2>
                {opcoes.length === 0 ? (
                  <>
                    <p className="osNote">Posso propor duas ou três leituras dos mesmos fatos.</p>
                    <div className="cbActs">
                      <button className="osStart" type="button" onClick={pedirPontos} disabled={pending}>
                        Me mostre as opções
                      </button>
                    </div>
                  </>
                ) : (
                  <ul className="cbOptions">
                    {opcoes.map((o) => (
                      <li key={o.id}>
                        <button type="button" onClick={() => escolherPonto(o.id)} disabled={pending}>
                          <strong>{o.label}</strong>
                          <span>{o.because}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <HelpNote question="O que acontece depois?">
                  <p>
                    Escolhido o ponto, eu monto os momentos da peça a partir dos fatos que você
                    confirmou, marco o que precisa de apoio visual e digo o que não pode ser
                    reencenado.
                  </p>
                  <p>
                    Roteiro não é a primeira etapa: só aparece no fim, e só se você pedir ajuda para
                    organizar as palavras.
                  </p>
                </HelpNote>

                <label className="osField cbOther">
                  <span>Quero dizer outra coisa</span>
                  <input
                    value={pontoProprio}
                    onChange={(e) => setPontoProprio(e.target.value)}
                    placeholder="O ponto, com as suas palavras"
                  />
                </label>
                {pontoProprio.trim().length > 3 ? (
                  <button className="osStart" type="button" onClick={() => escolherPonto('custom', pontoProprio.trim())} disabled={pending}>
                    É esse o ponto
                  </button>
                ) : null}
              </div>
            ) : null}

            {etapa === 'structure' ? (
              <div className="cbStage">
                <h2>Está montada.</h2>
                <p className="osNote">
                  {resumo?.beats} momentos.{' '}
                  {resumo?.suggestions
                    ? `${resumo.suggestions} ${resumo.suggestions === 1 ? 'é sugestão minha de forma' : 'são sugestões minhas de forma'}; o resto vem do que você contou.`
                    : 'Todos vêm do que você contou.'}
                </p>

                {roteiro ? (
                  <div className="cbScript">
                    <p className="cbScriptNote">Um guia, não um texto obrigatório. Fale do seu jeito.</p>
                    <pre>{roteiro}</pre>
                  </div>
                ) : null}

                <div className="cbActs">
                  <button className="osStart" type="button" onClick={prontaParaGravar} disabled={pending}>
                    Pronta para gravar
                  </button>
                  {!roteiro ? (
                    <button className="focusSkip" type="button" onClick={pedirRoteiro} disabled={pending}>
                      Me ajude a organizar as palavras
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {etapa === 'done' ? (
              <div className="cbStage">
                <h2>Salvei.</h2>
                <p className="osNote">
                  {fatos.length
                    ? 'Está em Conteúdo, pronta para quando quiser gravar.'
                    : 'A história ficou salva. Não consegui transcrever agora — dá para tentar de novo no Banco.'}
                </p>
                <div className="cbActs">
                  <button className="osStart" type="button" onClick={close}>
                    Fechar
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
