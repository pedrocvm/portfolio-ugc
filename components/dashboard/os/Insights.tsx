import Link from 'next/link';

/** Os avisos proativos no Hoje.
 *
 *  Não são notificações: não piscam, não interrompem, e cada um leva ao lugar
 *  onde se resolve.
 *
 *  Passaram para debaixo da fila. Estavam entre o resumo e as decisões, e com
 *  dados reais eram seis linhas a empurrar a primeira decisão para fora da
 *  tela — a repetir a mesma frase seis vezes, uma por marca parada. O que pede
 *  decisão vem primeiro; isto é contexto, e contexto lê-se depois.
 *
 *  Três, no máximo. Um padrão que precisa de sete linhas para se explicar não é
 *  um padrão, é uma lista. */

export type InsightRow = {
  id: string;
  severity: 'info' | 'warn' | 'urgent';
  title: string;
  detail: string;
  href: string | null;
};

const MAX = 3;

export default function Insights({ insights }: { insights: InsightRow[] }) {
  if (insights.length === 0) return null;

  return (
    <section className="osInsights" aria-label="Avisos">
      {insights.slice(0, MAX).map((i) =>
        i.href ? (
          <Link className="osInsight" key={i.id} href={i.href} data-sev={i.severity}>
            <b>{i.title}</b>
            <span>{i.detail}</span>
          </Link>
        ) : (
          <div className="osInsight" key={i.id} data-sev={i.severity}>
            <b>{i.title}</b>
            <span>{i.detail}</span>
          </div>
        ),
      )}
      {insights.length > MAX ? (
        <Link className="osInsightMore" href="/dashboard/analytics">
          Mais {insights.length - MAX} a olhar
        </Link>
      ) : null}
    </section>
  );
}
