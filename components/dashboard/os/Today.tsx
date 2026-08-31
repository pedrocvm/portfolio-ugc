import Link from 'next/link';
import type { ActionRow } from '@/modules/actions/service';
import type { Flags } from '@/lib/flags';
import Insights, { type InsightRow } from './Insights';
import Queue from './Queue';
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
  insights: InsightRow[];
  flags: Flags;
  integration: { status: string; lastSuccessAt: string | null; account: string };
};

export default function Today({ data, read }: { data: TodayData; read?: React.ReactNode }) {
  const { actions, flags, integration } = data;
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

      <Insights insights={data.insights} />

      {/* O motivo do silêncio já está no resumo acima; aqui fica só o que ela
          pode fazer a seguir. */}
      {actions.length === 0 ? (
        <p className="osEmpty">
          {integration.status === 'connected' ? (
            <>
              Se souberes de alguma coisa que o sistema não viu,{' '}
              <Link href="/dashboard/capture">cole aqui</Link>.
            </>
          ) : (
            <>
              Você pode <Link href="/dashboard/settings">ligar o Gmail</Link> para as conversas
              entrarem sozinhas, ou <Link href="/dashboard/capture">colar uma</Link> à mão.
            </>
          )}
        </p>
      ) : null}

      <Queue actions={actions} />
    </>
  );
}
