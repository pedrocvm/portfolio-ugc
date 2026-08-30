import { formatDate } from '@/lib/time';
import type { TimelineEntry } from '@/modules/activity/service';

/** A memória operacional. Cada linha diz o que aconteceu, quem o fez e —
 *  quando existe — a prova por baixo, fechada num `details` para não encher o
 *  ecrã com JSON. */

const ACTOR_LABEL: Record<string, string> = {
  carol: 'Carol',
  operator: 'Pedro',
  ai: 'IA',
  system: 'sistema',
  brand: 'marca',
};

/** O payload cru só interessa quando traz factos comerciais. Chaves de
 *  plumbing não valem uma gaveta. */
const NOISE = new Set(['imported', 'applied', 'triggerEventId', 'signal', 'snippet']);

export default function Timeline({ entries }: { entries: TimelineEntry[] }) {
  if (!entries.length) {
    return <p className="osEmpty">Ainda não há história registada.</p>;
  }

  return (
    <ul className="osTimeline">
      {entries.map((e) => {
        const facts = Object.entries(e.payload).filter(
          ([k, v]) => !NOISE.has(k) && v !== null && v !== undefined && v !== '' &&
            !(Array.isArray(v) && v.length === 0),
        );

        return (
          <li key={e.id} data-actor={e.actorType}>
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
      })}
    </ul>
  );
}
