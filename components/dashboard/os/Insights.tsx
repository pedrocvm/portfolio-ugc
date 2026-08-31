import Link from 'next/link';

/** Os avisos proativos no Hoje.
 *
 *  Não são notificações: não piscam, não interrompem, e cada um leva ao sítio
 *  onde se resolve. Ficam abaixo do resumo e acima da fila, que é a ordem em
 *  que ela lê a página. */

export type InsightRow = {
  id: string;
  severity: 'info' | 'warn' | 'urgent';
  title: string;
  detail: string;
  href: string | null;
};

export default function Insights({ insights }: { insights: InsightRow[] }) {
  if (insights.length === 0) return null;

  return (
    <section className="osInsights" aria-label="Avisos">
      {insights.map((i) =>
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
    </section>
  );
}
