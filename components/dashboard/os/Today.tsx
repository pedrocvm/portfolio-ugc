import Link from 'next/link';
import type { ActionRow } from '@/modules/actions/service';
import type { Flags } from '@/lib/flags';
import ActionCard from './ActionCard';
import Replan from './Replan';

/** «O que preciso de fazer hoje?»
 *
 *  Uma fila curta e ordenada. Não é um painel: não há gráficos, não há
 *  contadores decorativos, e nada aqui pede manutenção. */

export type TodayData = {
  actions: ActionRow[];
  greeting: string;
  counts: { openOpportunities: number; dueFollowUps: number; needsReview: number; overdue: number };
  /** O dia dito por extenso. Substitui os contadores: «13» não é informação
   *  até alguém dizer 13 de quê e se isso é bom ou mau. */
  brief: string;
  flags: Flags;
  integration: { status: string; lastSuccessAt: string | null; account: string };
};

export default function Today({ data, read }: { data: TodayData; read?: React.ReactNode }) {
  const { actions, flags, integration } = data;
  const urgent = actions.filter((a) => a.priorityScore >= 90);
  const rest = actions.filter((a) => a.priorityScore < 90);

  return (
    <>
      <div className="dashBar">
        <h1>Hoje</h1>
        <Replan />
      </div>

      {flags.shadow_mode ? (
        <p className="osWarn" data-tone="info">
          Modo sombra ligado. O CarolOS observa, classifica e recomenda, mas não muda estado
          sozinho nem envia nada. Quando confiares no que ele propõe, desliga em{' '}
          <Link href="/dashboard/settings">Definições</Link>.
        </p>
      ) : null}

      {integration.status === 'error' || integration.status === 'revoked' ? (
        <p className="osWarn">
          A ligação ao Gmail está {integration.status === 'revoked' ? 'revogada' : 'com erro'}. Enquanto
          não for reposta, as conversas novas não entram sozinhas —{' '}
          <Link href="/dashboard/capture">a captura rápida</Link> continua a funcionar.
        </p>
      ) : null}

      <p className="osBrief">{data.brief}</p>
      {read}

      {/* O motivo do silêncio já está no resumo acima; aqui fica só o que ela
          pode fazer a seguir. */}
      {actions.length === 0 ? (
        <p className="osEmpty">
          {integration.status === 'connected' ? (
            <>
              Se souberes de alguma coisa que o sistema não viu,{' '}
              <Link href="/dashboard/capture">cola aqui</Link>.
            </>
          ) : (
            <>
              Podes <Link href="/dashboard/settings">ligar o Gmail</Link> para as conversas
              entrarem sozinhas, ou <Link href="/dashboard/capture">colar uma</Link> à mão.
            </>
          )}
        </p>
      ) : null}

      {urgent.length ? (
        <section className="osSection">
          <h2>Primeiro isto</h2>
          <p className="osNote">Alguém está à espera de ti, ou há dinheiro a arriscar-se.</p>
          <div className="osQueue">
            {urgent.map((a, i) => (
              <ActionCard key={a.id} action={a} index={i} />
            ))}
          </div>
        </section>
      ) : null}

      {rest.length ? (
        <section className="osSection">
          <h2>{urgent.length ? 'Depois' : 'A fila'}</h2>
          <div className="osQueue">
            {rest.map((a, i) => (
              <ActionCard key={a.id} action={a} index={i} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
