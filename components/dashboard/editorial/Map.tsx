import { setTopicStateAction } from '@/app/dashboard/editorial-actions';
import type { EditorialScreen } from '@/modules/editorial/service';
import styles from './editorial.module.css';

const STATE = {
  now: 'Agora',
  next: 'Próximos',
  later: 'Depois',
  paused: 'Pausado',
} as const;

export default function EditorialMap({ data, error }: { data: EditorialScreen; error?: string }) {
  const pillars = Array.from(new Map(data.topics.map((t) => [t.pillarKey, t.pillarName])).entries());
  return (
    <div className={styles.wrap}>
      <header className={styles.hero}>
        <p className={styles.kicker}>Conteúdo · Mapa</p>
        <h1>Sobre o que a Carol fala</h1>
        <p className={styles.lead}>
          Assuntos recorrentes, não ideias de posts. O estado decide o que pode disputar prioridade agora.
        </p>
      </header>

      <div className={styles.focus}>
        <strong>Foco atual</strong>
        <p>{data.focus.title}</p>
        <p>{data.focus.summary}</p>
      </div>
      {error ? <div className={styles.error}>{error}</div> : null}

      <section className={`${styles.section} ${styles.pillars}`}>
        {pillars.map(([key, name]) => (
          <div className={styles.pillar} key={key}>
            <div className={styles.pillarHead}>
              <h2>{name}</h2>
              <span className={styles.small}>{data.topics.filter((t) => t.pillarKey === key && t.state === 'now').length} em Agora</span>
            </div>
            <div className={styles.topicList}>
              {data.topics.filter((t) => t.pillarKey === key).map((topic) => (
                <div className={styles.topic} key={topic.id}>
                  <span className={styles.topicName}>{topic.name}</span>
                  <form action={setTopicStateAction}>
                    <input type="hidden" name="topicId" value={topic.id} />
                    <select className={styles.stateSelect} name="state" defaultValue={topic.state} aria-label={`Estado de ${topic.name}`}>
                      {Object.entries(STATE).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                    </select>
                    <button className={styles.button} type="submit">Salvar</button>
                  </form>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
