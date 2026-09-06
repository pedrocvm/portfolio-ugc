'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useExit } from '@/components/dashboard/useExit';
import { saveGuideProgress } from '@/app/dashboard/content-brain-actions';
import {
  TEACHING_STEPS,
  clampStep,
  guidePercent,
  isFirstGuideStep,
  isLastGuideStep,
  nextGuideStep,
  prevGuideStep,
  type GuideStep,
} from '@/modules/content-brain/guide';
import type { FunctionalPillar } from '@/modules/content-brain/domain';
import GuideScene from './GuideScenes';
import StoryWorkshop from './StoryWorkshop';

/** «Como usar» — o guia do Content Brain.
 *
 *  A feature tem profundidade a mais para se entregar só como telas. O guia
 *  não ensina a operar o sistema: ensina que ela não precisa operar o sistema.
 *  Oito etapas, e todas respondem à mesma pergunta — o que precisa dela agora.
 *
 *  O convite da primeira visita não abre nada sozinho. Fica ao lado do
 *  cabeçalho, em voz baixa, e some assim que ela responder de qualquer forma:
 *  interromper duas vezes quem já disse «agora não» é o que faz um produto
 *  parecer um SaaS a pedir atenção.
 *
 *  Nada do que se vê aqui dentro é dado real e nada disto é escrito na base.
 *  As cenas são fixtures visuais; o único efeito do guia é a linha em
 *  `app_setting` que diz onde ela ficou. */

type Ecra = {
  step: GuideStep;
  eyebrow: string;
  title: string;
  body: string[];
  /** A frase que fica, destacada. Uma por etapa, no máximo. */
  rule?: string;
  quote?: string;
};

const ECRAS: Ecra[] = [
  {
    step: 'what',
    eyebrow: 'O que é',
    title: 'Você não vem aqui buscar uma ideia pronta.',
    body: [
      'O Content Brain ajuda você a descobrir o que precisa ser produzido. A matéria-prima não nasce aqui dentro: vem da sua vida.',
      'Coisas que aconteceram, opiniões, reações, dificuldades, mudanças, pequenas vitórias — situações pessoais ou de trabalho que você queira dividir.',
    ],
    rule: 'O CarolOS não inventa sua vida para preencher calendário.',
  },
  {
    step: 'day',
    eyebrow: 'Como começar o dia',
    title: 'Você não decide sozinha o que postar.',
    body: [
      'O sistema diz qual é o foco da semana, que função o conteúdo precisa cumprir e que tipo de situação real estamos procurando.',
      'Antes da caixa de texto ele ainda oferece por onde procurar na memória: algo que deu errado, expectativa e realidade, uma decisão que você mudou.',
    ],
    rule: 'Sua pergunta é só uma: aconteceu alguma coisa comigo que encaixa nisso?',
  },
  {
    step: 'tell',
    eyebrow: 'Contar',
    title: 'Conte o que aconteceu, do jeito que contaria para alguém.',
    body: [
      'Falar é o caminho principal. Escrever é a alternativa, e está sempre ali.',
      'Não tente pensar no roteiro nem na ordem. O CarolOS organiza depois.',
    ],
    quote:
      'Ontem fiquei duas horas tentando mudar um cenário e depois percebi que o primeiro estava melhor.',
  },
  {
    step: 'confirm',
    eyebrow: 'Confirmar',
    title: 'Primeiro ele devolve o que entendeu.',
    body: [
      'Antes de estruturar qualquer coisa, o CarolOS mostra os fatos que ouviu e pergunta se foi isso.',
      'Você corrige o que ficou torto, tira o que não quer usar, ou marca a situação como privada. Só depois ele estrutura.',
    ],
    rule: 'Ele não completa uma parte que você não contou.',
  },
  {
    step: 'workshop',
    eyebrow: 'Story Workshop',
    title: 'Só então os dois montam a peça.',
    body: [
      'A partir da história confirmada, o sistema ajuda a encontrar o ponto, a função, onde está a identificação, o conflito, o significado, uma possível série, a estrutura, o formato e o material visual.',
    ],
    rule: 'Roteiro não é a primeira etapa. É a última, e é opcional.',
  },
  {
    step: 'record',
    eyebrow: 'Gravação',
    title: 'Na hora de gravar, some tudo o que não é gravar.',
    body: [
      'Você vê o que está contando, o ponto central, os momentos que não podem faltar, o material visual e as palavras que precisam continuar verdadeiras.',
      'Um momento de cada vez. O lugar onde você parou sobrevive a fechar o celular.',
    ],
    rule: 'A estratégia inteira não aparece aqui. Só o necessário para executar.',
  },
  {
    step: 'learn',
    eyebrow: 'Depois de publicar',
    title: 'Você não precisa ficar olhando os Insights.',
    body: [
      'O CarolOS detecta a publicação e mede sozinho, em janelas fixas: 1h, 6h, 24h, 72h, 7 dias e 30 dias.',
      'O que ele encontra sobe um degrau de cada vez — sinal, hipótese, aprendizado — e a leitura é sempre contra a sua própria mediana.',
    ],
    rule: 'Um vídeo bom não vira regra.',
  },
  {
    step: 'nothing',
    eyebrow: 'E se eu não tiver nada para contar?',
    title: 'Pode dizer que não aconteceu nada.',
    body: [
      'O sistema pode recuperar histórias que você já contou, continuar uma que ficou no meio, trocar a direção de busca, mapear outro pilar — ou simplesmente não produzir conteúdo naquele dia.',
    ],
    rule: 'Calendário vazio não autoriza inventar história.',
  },
  {
    step: 'ready',
    eyebrow: '',
    title: 'Pronto.',
    body: [
      'Você não precisa decorar nada disso. O CarolOS vai te conduzir sempre pela próxima decisão.',
    ],
    rule: 'Quando estiver em dúvida: o que precisa de mim agora?',
  },
];

/** O botão, o convite da primeira visita e o guia. Um componente só porque os
 *  três partilham o mesmo estado — e porque abrir o guia a partir do convite
 *  não pode passar por uma volta ao servidor. */
export default function ContentGuide({
  focus,
  offerFirstRun,
  resumeAt,
}: {
  focus: FunctionalPillar;
  offerFirstRun: boolean;
  resumeAt: number;
}) {
  const [open, setOpen] = useState(false);
  const [passo, setPasso] = useState(() => clampStep(resumeAt));
  /** Onde o modal é pintado. O botão vive dentro do `.dashBar`, que é
   *  `sticky` com `z-index` — e um elemento posicionado com camada abre um
   *  contexto de empilhamento próprio: o guia ficava preso lá dentro, na
   *  camada 10, e a barra de abas do celular passava-lhe por cima. O portal
   *  leva-o para o `.dash`, onde as variáveis da paleta continuam a valer. */
  const [palco, setPalco] = useState<Element | null>(null);
  const [convite, setConvite] = useState(offerFirstRun);
  const [contarAgora, setContarAgora] = useState(false);

  const caixa = useRef<HTMLDivElement>(null);
  const veioDe = useRef<HTMLElement | null>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const esteveAberto = useRef(false);

  const { closing, close } = useExit(() => setOpen(false), 220);

  useEffect(() => {
    setPalco(botao.current?.closest('.dash') ?? null);
  }, []);

  // Memória, não estado da tela: se falhar, o guia continua a funcionar e a
  // única coisa que se perde é reabrir na etapa certa amanhã.
  const lembrar = useCallback(
    (input: { step?: number; dismissed?: boolean; completed?: boolean }) =>
      void saveGuideProgress(input).catch(() => {}),
    [],
  );

  const abrir = useCallback(
    (em: number) => {
      veioDe.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const inicio = clampStep(em);
      setPasso(inicio);
      setConvite(false);
      setOpen(true);
      lembrar({ step: inicio });
    },
    [lembrar],
  );

  const fechar = useCallback(() => {
    lembrar({ step: passo, completed: isLastGuideStep(passo) || undefined });
    close();
  }, [close, lembrar, passo]);

  const agoraNao = () => {
    setConvite(false);
    lembrar({ dismissed: true });
    botao.current?.focus();
  };

  const irPara = (i: number) => {
    const alvo = clampStep(i);
    setPasso(alvo);
    lembrar({ step: alvo, completed: isLastGuideStep(alvo) || undefined });
    caixa.current?.scrollTo?.({ top: 0 });
  };

  /** O CTA final fecha o guia e abre a história de verdade — o mesmo Story
   *  Workshop que o Hoje abre, na mesma etapa: por onde procurar. */
  const comecarHistoria = () => {
    lembrar({ step: passo, completed: true });
    // O foco não volta ao botão: quem manda no foco a seguir é o Workshop que
    // abre por cima. Devolvê-lo tirava o foco do modal acabado de abrir.
    esteveAberto.current = false;
    veioDe.current = null;
    setOpen(false);
    setContarAgora(true);
  };

  // Foco preso dentro do guia, Escape fecha, e o foco volta ao botão que o
  // abriu. Sem o retorno, fechar deixava o foco no `body` e a tecla seguinte
  // não tinha para onde ir.
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    caixa.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        fechar();
        return;
      }
      if (e.key !== 'Tab') return;
      const alvos = caixa.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!alvos || alvos.length === 0) return;
      const primeiro = alvos[0];
      const ultimo = alvos[alvos.length - 1];
      const foco = document.activeElement;
      if (e.shiftKey && (foco === primeiro || foco === caixa.current)) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && foco === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    };
  }, [open, fechar]);

  // Só depois de ter estado aberto: sem a marca, isto roubava o foco a quem
  // estivesse a meio de outra coisa assim que a tela pintasse.
  useEffect(() => {
    if (open) {
      esteveAberto.current = true;
      return;
    }
    if (!esteveAberto.current) return;
    esteveAberto.current = false;
    const antes = veioDe.current;
    veioDe.current = null;
    (antes ?? botao.current)?.focus?.();
  }, [open]);

  const ecra = ECRAS[passo] ?? ECRAS[0];
  const ultimo = isLastGuideStep(passo);
  const posicao = Math.min(passo + 1, TEACHING_STEPS);

  /** No `.dash` quando ele já existe; onde está, antes do primeiro efeito. */
  const sobreposto = (conteudo: React.ReactNode) =>
    palco ? createPortal(conteudo, palco) : conteudo;

  return (
    <>
      <button className="cbGuideOpen" type="button" ref={botao} onClick={() => abrir(resumeAt)}>
        Como usar
      </button>

      {convite ? (
        <aside className="cbGuideOffer">
          <p className="cbGuideOfferText">
            Primeira vez no novo Content Brain? Em alguns minutos eu mostro como usar, sem você
            precisar entender essa tela toda.
          </p>
          <div className="cbGuideOfferActs">
            <button className="osStart" type="button" onClick={() => abrir(0)}>
              Me mostra
            </button>
            <button className="focusSkip" type="button" onClick={agoraNao}>
              Agora não
            </button>
          </div>
        </aside>
      ) : null}

      {sobreposto(
        <>
          {open ? (
            <div className="cbGuide" data-closing={closing || undefined}>
              <div
                className="cbGuideBox"
                role="dialog"
                aria-modal="true"
                aria-labelledby="cbGuideTitle"
                tabIndex={-1}
                ref={caixa}
              >
                <header className="cbGuideTop">
                  <span className="cbStep">
                    Guia do Content Brain
                    {ultimo ? '' : ` · ${posicao} de ${TEACHING_STEPS}`}
                  </span>
                  <button type="button" onClick={fechar} aria-label="Fechar o guia">
                    ×
                  </button>
                </header>

                <div
                  className="cbGuideBar"
                  role="progressbar"
                  aria-valuemin={1}
                  aria-valuemax={TEACHING_STEPS}
                  aria-valuenow={posicao}
                  aria-valuetext={`Etapa ${posicao} de ${TEACHING_STEPS}`}
                  aria-label="Progresso do guia"
                >
                  <span style={{ '--p': `${guidePercent(passo)}%` } as React.CSSProperties} />
                </div>

                <div className="cbGuideBody" key={ecra.step}>
                  <div className="cbGuideText">
                    {ecra.eyebrow ? <p className="cbLensEyebrow">{ecra.eyebrow}</p> : null}
                    <h2 id="cbGuideTitle">{ecra.title}</h2>
                    {ecra.body.map((linha, i) => (
                      <p className="cbGuideP" key={i}>
                        {linha}
                      </p>
                    ))}
                    {ecra.quote ? <p className="cbGuideQuote">«{ecra.quote}»</p> : null}
                    {ecra.rule ? <p className="cbGuideRuleText">{ecra.rule}</p> : null}
                  </div>

                  <GuideScene step={ecra.step} />
                </div>

                <footer className="cbGuideActs">
                  {ultimo ? (
                    <>
                      <button className="osStart" type="button" onClick={comecarHistoria}>
                        Quero começar com uma história
                      </button>
                      <button className="focusSkip" type="button" onClick={fechar}>
                        Fechar guia
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="osStart" type="button" onClick={() => irPara(nextGuideStep(passo))}>
                        Continuar
                      </button>
                      {isFirstGuideStep(passo) ? null : (
                        <button className="chip" type="button" onClick={() => irPara(prevGuideStep(passo))}>
                          Anterior
                        </button>
                      )}
                    </>
                  )}
                </footer>
              </div>
            </div>
          ) : null}

          {/* O guia acabou e ela disse que quer contar: abre o fluxo verdadeiro,
              na etapa em que o Hoje também entra. */}
          {contarAgora ? (
            <StoryWorkshop focus={focus} autoOpen onClose={() => setContarAgora(false)} />
          ) : null}
        </>,
      )}
    </>
  );
}
