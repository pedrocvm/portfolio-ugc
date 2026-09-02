import Link from 'next/link';
import type { MorningBrief } from '@/modules/morning/service';
import MorningFlow from './MorningFlow';

/** O Morning Brief, no topo do Hoje.
 *
 *  Substitui «Há 17 coisas para hoje, 16 já fora de prazo» — um sistema que
 *  abre sempre com uma acusação deixa de ser aberto. Aqui a primeira frase diz
 *  quantas decisões há e quanto tempo custam, e por baixo fica o que o sistema
 *  fez sozinho enquanto ela não estava.
 *
 *  Não é um destino novo. É a mesma tela de sempre, com o trabalho já feito. */

export default function Morning({ brief }: { brief: MorningBrief }) {
  const { decisions, prepared, preparedLines, gaps } = brief;

  return (
    <section className="morn" data-status={brief.status}>
      <p className="mornLead">{brief.headline}</p>

      {decisions.length ? (
        <MorningFlow
          decisions={decisions}
          closing={closingFor(brief)}
          prepared={preparedLines}
        />
      ) : null}

      {preparedLines.length ? (
        <details className="mornWork">
          <summary>
            Enquanto não estava, o Carol OS trabalhou
            <span aria-hidden="true"> ↓</span>
          </summary>
          <ul>
            {preparedLines.map((l, i) => (
              <li key={i}>{l.charAt(0).toUpperCase() + l.slice(1)}.</li>
            ))}
          </ul>
          {prepared.trendsFound > 0 || prepared.referencesFound > 0 ? (
            <p className="osNote">
              A pesquisa não vira tarefa: as {prepared.trendsFound} tendências e as{' '}
              {prepared.referencesFound} referências viraram as recomendações que estão aqui em cima.
            </p>
          ) : null}
        </details>
      ) : null}

      {/* A honestidade importa mais do que a aparência de ter corrido tudo bem.
          Uma manhã que finge é uma manhã em que ela deixa de acreditar. */}
      {gaps.length ? (
        <div className="mornGaps" role="status">
          <p className="mornGapsTitle">O que não consegui fazer</p>
          <ul>
            {gaps.map((g, i) => (
              <li key={i}>{g.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {decisions.length === 0 && preparedLines.length === 0 && gaps.length === 0 ? (
        <p className="osNote">
          Ainda não preparei esta manhã. Assim que os trabalhos correrem, aparece aqui.{' '}
          <Link href="/dashboard/settings">Ver o agendador</Link>.
        </p>
      ) : null}
    </section>
  );
}

/** A frase de fecho é escrita aqui e não no domínio porque precisa de contar
 *  coisas que só a manhã consolidada sabe. */
function closingFor(brief: MorningBrief): string {
  const gravacoes = brief.decisions.filter((d) => d.kind === 'recording').length;
  const marcas = brief.prepared.brandsFound;

  const partes: string[] = [];
  if (gravacoes > 0) {
    partes.push(gravacoes === 1 ? 'há uma gravação para hoje' : `há ${gravacoes} gravações para hoje`);
  }
  if (marcas > 0) partes.push('amanhã procuro mais marcas');

  if (partes.length === 0) return 'A manhã está organizada.';
  const lista = partes.length === 1 ? partes[0] : `${partes[0]} e ${partes[1]}`;
  return `A manhã está organizada. ${lista.charAt(0).toUpperCase()}${lista.slice(1)}.`;
}
