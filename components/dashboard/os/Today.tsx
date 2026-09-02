import Link from 'next/link';
import type { ActionRow } from '@/modules/actions/service';
import type { BackgroundItem } from '@/modules/actions/day';
import type { Flags } from '@/lib/flags';
import { closingLine } from '@/modules/actions/day';
import type { MorningBrief } from '@/modules/morning/service';
import Insights, { type InsightRow } from './Insights';
import Focus from './Focus';
import Morning from './Morning';
import Queue from './Queue';
import Replan from './Replan';

/** «O que preciso de fazer hoje?»
 *
 *  Três estados, e a diferença entre eles é a única coisa que esta tela tem de
 *  ensinar:
 *
 *    precisa de si       — pede uma decisão
 *    o CarolOS trata     — está a acontecer, não pede nada
 *    fechado hoje        — já não existe, mas conta
 *
 *  Antes era tudo a mesma lista. Uma fila de dez em que seis não eram para ela
 *  é uma fila que ensina a não confiar na fila. */

export type TodayData = {
  actions: ActionRow[];
  greeting: string;
  counts: { openOpportunities: number; dueFollowUps: number; needsReview: number; overdue: number };
  /** O dia dito por extenso. Substitui os contadores: «13» não é informação
   *  até alguém dizer 13 de quê e se isso é bom ou mau. */
  brief: string;
  background: BackgroundItem[];
  doneToday: number;
  insights: InsightRow[];
  /** O que a noite preparou. Nulo quando a consolidação não correu — e nesse
   *  caso mostra-se a fila de sempre em vez de inventar uma manhã. */
  morning: MorningBrief | null;
  flags: Flags;
  integration: { status: string; lastSuccessAt: string | null; account: string };
};

/** «Bom dia» às nove da manhã e à meia-noite não é a mesma frase. */
function saudacao(nome: string) {
  const h = new Date().getHours();
  const parte = h < 13 ? 'Bom dia' : h < 20 ? 'Boa tarde' : 'Boa noite';
  return `${parte}, ${nome.split(' ')[0]}.`;
}

export default function Today({ data, read }: { data: TodayData; read?: React.ReactNode }) {
  const { actions, background, doneToday, integration } = data;
  const partida = integration.status === 'error' || integration.status === 'revoked';

  return (
    <>
      <div className="dashBar">
        <h1>{saudacao(data.greeting)}</h1>
      </div>

      {/* Só o que está partido interrompe. O resto do estado do sistema vive
          em Definições, onde se vai de propósito. */}
      {partida ? (
        <p className="osWarn" role="alert">
          Perdi o acesso ao Gmail, por isso as conversas novas não estão a entrar.{' '}
          <Link href="/dashboard/settings">Voltar a ligar</Link>.
        </p>
      ) : null}

      {/* A manhã preparada substitui o resumo genérico. Sem ela — cron
          desligado, ou consolidação falhada — o Hoje continua a funcionar como
          antes, que é o que impede um trabalho em baixo de apagar a tela. */}
      {data.morning ? (
        <Morning brief={data.morning} />
      ) : (
        <>
          <p className="osBrief">{data.brief}</p>
          {read}
          {actions.length ? (
            <div className="osLead">
              <Focus actions={actions} />
            </div>
          ) : null}
        </>
      )}

      {/* Com a manhã preparada, a fila antiga deixa de ser a superfície
          principal e passa a arquivo. Duas listas a competir pela mesma
          atenção é o que fazia o Hoje parecer uma dívida. */}
      {actions.length && data.morning ? (
        <details className="osRest">
          <summary>
            O resto da fila <b>{actions.length}</b>
          </summary>
          <Queue actions={actions} />
        </details>
      ) : actions.length ? (
        <Queue actions={actions} />
      ) : data.morning ? null : (
        <section className="osSection osQuiet">
          <h2>Está tudo.</h2>
          <p className="osNote">{closingLine(background)}</p>
        </section>
      )}

      <Insights insights={data.insights} />

      {background.length ? (
        <section className="osSection osBg">
          <h2>O CarolOS está a tratar de</h2>
          <ul className="osBgList">
            {background.map((b, i) => (
              <li key={`${b.kind}-${i}`}>{b.label}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Dobrado, e em último. É memória, não é trabalho — mas ver a conta subir
          é o que faz a fila parecer que anda. */}
      {doneToday > 0 ? (
        <details className="osDone">
          <summary>
            Fechado hoje <b>{doneToday}</b>
          </summary>
          <p className="osNote">
            {doneToday === 1
              ? 'Uma coisa saiu da fila hoje.'
              : `${doneToday} coisas saíram da fila hoje.`}{' '}
            Se alguma voltar, é porque o assunto voltou a mexer.
          </p>
        </details>
      ) : null}

      {/* Manutenção, e por isso no fim e em voz baixa. O cron pode não estar
          ligado, e nesse caso isto é a única forma de a fila ficar certa.
          O modo sombra saiu daqui: é uma definição permanente, não uma coisa
          que aconteça hoje, e estava a interromper todos os dias para dizer o
          mesmo. Vive em Definições, onde se vai de propósito. */}
      <div className="osMaint">
        <Replan />
      </div>
    </>
  );
}
