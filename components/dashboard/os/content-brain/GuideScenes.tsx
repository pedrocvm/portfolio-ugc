import type { GuideStep } from '@/modules/content-brain/guide';

/** As cenas do guia: o lado direito de cada etapa.
 *
 *  São fixtures visuais, e é uma escolha. Reaproveitar os componentes
 *  verdadeiros traria as `server actions` atrás — o LensPicker vai à base
 *  ao montar — e um guia que consulta a base para ilustrar uma tela é um guia
 *  que fica lento e que escreve telemetria de uma sessão que não aconteceu.
 *
 *  O que se reaproveita são as classes e os tokens: `.cbMic`, `.osRow`,
 *  `.recPoint` e os filetes são os mesmos que a tela real usa, por isso a
 *  cena não é um desenho parecido — é o mesmo CSS sem os dados.
 *
 *  Nada aqui é interativo e nada disto é gravável: sem botões, sem `input`,
 *  sem `action`. O leitor de tela ignora a cena e lê a explicação da esquerda,
 *  que é escrita para se bastar. */

export default function GuideScene({ step }: { step: GuideStep }) {
  return (
    <div className="cbGuideScene" aria-hidden="true">
      {CENAS[step]}
    </div>
  );
}

const CENAS: Record<GuideStep, React.ReactNode> = {
  what: (
    <div className="cbGuideOrigin">
      <div className="cbGuideSource">
        <span className="cbGuideTag">CarolOS</span>
        <p>Estratégia, memória e números</p>
      </div>
      <div className="cbGuideSource" data-mine>
        <span className="cbGuideTag">Carol</span>
        <p>Vida real, opinião e reação</p>
      </div>
      <span className="cbGuideArrow">↓</span>
      <div className="cbGuideOut">Conteúdo</div>
    </div>
  ),

  day: (
    <div className="cbGuideCard">
      <p className="cbFocusEyebrow">Esta semana</p>
      <p className="cbGuideH">Atração</p>
      <p className="cbGuideSerif">
        Preciso de uma situação real que tenha identificação, mudança, humor, dificuldade ou
        surpresa.
      </p>
      <div className="cbGuideRule" />
      <p className="cbGuideAsk">Aconteceu alguma coisa comigo que encaixa nisso?</p>
    </div>
  ),

  tell: (
    <div className="cbGuideCard">
      <p className="cbGuideQuestion">O que aconteceu nos últimos dias?</p>
      <p className="cbGuideMute">Pode ser bom, ruim, estranho ou pequeno.</p>
      <span className="cbMic cbGuideMic">
        <span className="cbMicDot" />
        Toque para contar
      </span>
      <span className="cbGuideAlt">Prefiro escrever</span>
    </div>
  ),

  confirm: (
    <div className="cbGuideCard">
      <p className="cbGuideH">Foi isso que aconteceu?</p>
      <ul className="cbGuideFacts">
        <li>Você passou cerca de duas horas mudando o cenário.</li>
        <li>Mudou tudo porque achou que o cenário era o problema.</li>
        <li>Depois preferiu a primeira versão.</li>
      </ul>
      <div className="cbGuideBtns">
        <span className="cbGuideBtn" data-primary>Sim, foi isso</span>
        <span className="cbGuideBtn">Corrigir</span>
      </div>
    </div>
  ),

  workshop: (
    <div className="cbGuideCard">
      <ol className="cbGuideChain">
        <li>O ponto da história</li>
        <li>A função que ela cumpre</li>
        <li>Onde está a identificação</li>
        <li>O conflito e o significado</li>
        <li>Se isso continua numa série</li>
        <li>Estrutura, formato e material visual</li>
      </ol>
      <p className="cbGuideLate">Roteiro — só se você pedir, e só no fim</p>
    </div>
  ),

  record: (
    <div className="cbGuidePhone">
      <div className="cbGuidePhoneIn">
        <span className="cbGuideCount">1/4</span>
        <div className="recPoint">
          <span className="recPointLabel">O ponto</span>
          <p>Eu complico tentando melhorar demais.</p>
        </div>
        <p className="cbGuideShot">Você contando o problema, de frente</p>
        <p className="cbGuideNote">Close no cenário que já estava montado</p>
        <span className="cbGuideBtn" data-primary>Gravei</span>
        <p className="cbGuideMute">O que tem de ser verdade ›</p>
      </div>
    </div>
  ),

  learn: (
    <div className="cbGuideCard">
      <span className="cbGuideStage">Publicado</span>
      <p className="cbGuideWindows">1h · 6h · 24h · 72h · 7d · 30d</p>
      <ul className="cbGuideLadder">
        <li data-on>Sinal — aconteceu, ainda não é padrão</li>
        <li>Hipótese — vale repetir em outra história real</li>
        <li>Aprendizado — se repetiu o suficiente para orientar decisão</li>
      </ul>
    </div>
  ),

  nothing: (
    <div className="cbGuideCard">
      <p className="cbGuideQuestion">Você viveu alguma coisa recentemente?</p>
      <span className="cbGuideBtn cbGuideNo">Não</span>
      <div className="cbGuideReply">
        <p>Tudo bem.</p>
        <p className="cbGuideMute">Você tem 4 histórias reais ainda disponíveis.</p>
      </div>
      <div className="cbGuideBtns">
        <span className="cbGuideBtn" data-primary>Ver histórias</span>
        <span className="cbGuideBtn">Deixar para outro dia</span>
      </div>
    </div>
  ),

  ready: (
    <div className="cbGuideEnd">
      <span className="cbGuideTag">O ciclo inteiro</span>
      <ol className="cbGuideLoop">
        <li>O CarolOS diz o que falta</li>
        <li>Você conta o que viveu</li>
        <li>Ele confirma antes de criar</li>
        <li>Os dois montam a peça</li>
        <li>Você grava e publica</li>
        <li>Ele mede e aprende sozinho</li>
      </ol>
      <p className="cbGuideEndAsk">e volta ao Hoje</p>
    </div>
  ),
};
