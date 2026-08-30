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
  flags: Flags;
  integration: { status: string; lastSuccessAt: string | null; account: string };
};

export default function Today({ data }: { data: TodayData }) {
  const { actions, counts, flags, integration } = data;
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

      <div className="osStats">
        <div className="osStat">
          <b>{actions.length}</b>
          <span>na fila</span>
        </div>
        <div className="osStat">
          <b>{counts.overdue}</b>
          <span>fora de prazo</span>
        </div>
        <div className="osStat">
          <b>{counts.openOpportunities}</b>
          <span>oportunidades abertas</span>
        </div>
        <div className="osStat">
          <b>{counts.needsReview}</b>
          <span>conversas por triar</span>
        </div>
      </div>

      {actions.length === 0 ? (
        <p className="osEmpty">
          Nada à espera de ti. Se isto parecer estranho, é porque o sistema ainda não está a ver as
          tuas conversas: liga o Gmail em <Link href="/dashboard/settings">Definições</Link> ou cola
          uma conversa em <Link href="/dashboard/capture">Captura</Link>.
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
