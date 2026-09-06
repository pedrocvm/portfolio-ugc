import { formatDate } from '@/lib/time';
import { isCommunicationEvent } from '@/modules/activity/events';
import type { TimelineEntry } from '@/modules/activity/service';

/** A memória operacional, em duas alturas.
 *
 *  O que foi dito e o que mudou de mãos — email, proposta, produto, dinheiro —
 *  fica à vista. O que o sistema anotou por conta própria — classificações,
 *  etapas, follow-ups agendados — dobra-se em grupos, e abre quando ela quer
 *  saber porquê. Uma cronologia onde «resposta classificada» tem o mesmo peso
 *  que «a marca respondeu» é uma cronologia que ninguém lê. */

const ACTOR_LABEL: Record<string, string> = {
  carol: 'Carol',
  operator: 'Pedro',
  ai: 'IA',
  system: 'sistema',
  brand: 'marca',
};

/** O payload cru só interessa quando traz fatos comerciais. Chaves de
 *  plumbing não valem uma gaveta. */
const NOISE = new Set(['imported', 'applied', 'triggerEventId', 'signal', 'snippet']);

type Bloco = { kind: 'communication'; entry: TimelineEntry } | { kind: 'system'; entries: TimelineEntry[] };

/** Agrupa os eventos do sistema que estão seguidos. Puro, e exportado para o
 *  teste o poder provar sem renderer. */
export function groupTimeline(entries: readonly TimelineEntry[]): Bloco[] {
  const out: Bloco[] = [];
  for (const e of entries) {
    if (isCommunicationEvent(e.eventType)) {
      out.push({ kind: 'communication', entry: e });
      continue;
    }
    const last = out[out.length - 1];
    if (last && last.kind === 'system') last.entries.push(e);
    else out.push({ kind: 'system', entries: [e] });
  }
  return out;
}

function Entry({ e }: { e: TimelineEntry }) {
  const facts = Object.entries(e.payload).filter(
    ([k, v]) => !NOISE.has(k) && v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0),
  );
  return (
    <li data-actor={e.actorType} data-kind={isCommunicationEvent(e.eventType) ? 'communication' : 'system'}>
      <div className="osEvent">
        <span className="osEventType">{e.label}</span>
        <span className="osEventWhen">
          {formatDate(e.occurredAt)} · {ACTOR_LABEL[e.actorType] ?? e.actorType}
          {e.channel ? ` · ${e.channel}` : ''}
          {typeof e.confidence === 'number' ? ` · confiança ${Math.round(e.confidence * 100)}%` : ''}
        </span>
      </div>
      {e.summary ? <p className="osEventText">{e.summary}</p> : null}
      {facts.length ? (
        <details className="osEvidence">
          <summary>Ver o que ficou registado</summary>
          <pre>{JSON.stringify(Object.fromEntries(facts), null, 2)}</pre>
        </details>
      ) : null}
    </li>
  );
}

export default function Timeline({ entries }: { entries: TimelineEntry[] }) {
  if (!entries.length) {
    return <p className="osEmpty">Ainda não há história registada.</p>;
  }

  return (
    <ul className="osTimeline">
      {groupTimeline(entries).map((b, i) =>
        b.kind === 'communication' ? (
          <Entry key={b.entry.id} e={b.entry} />
        ) : (
          <li key={`sys-${i}`} data-kind="system-group">
            <details className="osTimelineFold">
              <summary>
                {b.entries.length === 1 ? 'Uma anotação do sistema' : `${b.entries.length} anotações do sistema`}
                {' · '}
                {formatDate(b.entries[0].occurredAt)}
              </summary>
              <ul>
                {b.entries.map((e) => (
                  <Entry key={e.id} e={e} />
                ))}
              </ul>
            </details>
          </li>
        ),
      )}
    </ul>
  );
}
