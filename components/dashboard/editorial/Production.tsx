import type { EditorialScreen } from '@/modules/editorial/service';
import styles from './editorial.module.css';

export default function Production({ data }: { data: EditorialScreen }) {
  const pieces = data.week?.pieces.filter((p) => p.status !== 'proposed' && p.status !== 'rejected') ?? [];
  return (
    <div className={styles.wrap}>
      <header className={styles.hero}>
        <p className={styles.kicker}>Conteúdo · Produção</p>
        <h1>O que já passou pela sua decisão</h1>
        <p className={styles.lead}>
          Aqui entram somente peças aprovadas estrategicamente. O sistema não considera um roteiro pronto antes da sua validação.
        </p>
      </header>
      <section className={styles.section}>
        {pieces.length === 0 ? (
          <div className={styles.empty}>
            <h2>Ainda não há peça aprovada.</h2>
            <p>Volte à Semana, valide assunto, abordagem e formato. Só depois o trabalho de produção começa.</p>
          </div>
        ) : (
          <div className={styles.productionList}>
            {pieces.map((piece) => (
              <article className={styles.productionItem} key={piece.id}>
                <span className={styles.small}>{piece.pillarName} · {piece.format}</span>
                <h3>{piece.topicName}</h3>
                <p>{piece.angle}</p>
                <span className={styles.status}>Aprovado para desenvolver</span>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
