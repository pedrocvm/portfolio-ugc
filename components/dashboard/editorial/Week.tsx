import {
  adjustProposalAction,
  approveProposalAction,
  generateWeekAction,
  replaceProposalAction,
} from '@/app/dashboard/editorial-actions';
import type { EditorialScreen } from '@/modules/editorial/service';
import styles from './editorial.module.css';

const OBJECTIVE = {
  attract: 'Atrair',
  retain: 'Reter',
  prove: 'Provar',
  convert: 'Converter',
} as const;
const LENS = {
  who_i_am: 'Quem sou',
  how_i_think: 'Como penso',
  what_i_do: 'O que faço',
} as const;
const FORMAT = {
  reel: 'Reel',
  carousel: 'Carrossel',
  photo_sequence: 'Sequência de fotos',
} as const;

export default function Week({ data, error }: { data: EditorialScreen; error?: string }) {
  return (
    <div className={styles.wrap}>
      <header className={styles.hero}>
        <p className={styles.kicker}>Conteúdo · Semana</p>
        <h1>O que vale publicar agora</h1>
        <p className={styles.lead}>
          Três decisões por vez. O CarolOS propõe a estratégia; você valida antes de qualquer roteiro nascer.
        </p>
      </header>

      <div className={styles.focus}>
        <strong>Foco atual</strong>
        <p>{data.focus.summary}</p>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}

      {!data.week ? (
        <section className={styles.section}>
          <div className={styles.empty}>
            <h2>Monte a semana quando quiser decidir.</h2>
            <p>
              O sistema cruza os assuntos em AGORA, o foco atual e o equilíbrio recente para propor três peças. Ele não preenche um calendário vazio nem gera uma lista infinita.
            </p>
            <form action={generateWeekAction}>
              <button className={`${styles.button} ${styles.primary}`} type="submit">Montar esta semana</button>
            </form>
          </div>
        </section>
      ) : (
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>Esta semana</h2>
            <p>{data.week.weekStart}</p>
          </div>
          <p className={styles.weekSummary}>{data.week.summary}</p>
          <div className={styles.grid}>
            {data.week.pieces.map((piece, index) => (
              <article className={styles.card} key={piece.id}>
                <div className={styles.cardTop}>
                  <span className={styles.number}>0{index + 1}</span>
                  <span className={styles.status}>
                    {piece.status === 'approved_for_development' ? 'Aprovado' : 'Para validar'}
                  </span>
                </div>
                <div>
                  <h3>{piece.topicName}</h3>
                  <p className={styles.angle}>{piece.angle}</p>
                </div>
                <div className={styles.meta}>
                  <span>{piece.pillarName}</span>
                  <span>{OBJECTIVE[piece.objective]}</span>
                  <span>{LENS[piece.lens]}</span>
                  <span>{FORMAT[piece.format]}</span>
                  <span>{piece.structure}</span>
                </div>
                <div className={styles.why}>
                  <strong>Por que agora</strong>
                  <p>{piece.whyNow}</p>
                </div>

                {piece.status === 'proposed' ? (
                  <div className={styles.actions}>
                    <form action={approveProposalAction}>
                      <input type="hidden" name="pieceId" value={piece.id} />
                      <button className={`${styles.button} ${styles.primary}`} type="submit">Aprovar</button>
                    </form>
                    <form action={replaceProposalAction}>
                      <input type="hidden" name="pieceId" value={piece.id} />
                      <button className={styles.button} type="submit">Trocar</button>
                    </form>
                    <form action={adjustProposalAction} className={styles.adjust}>
                      <input type="hidden" name="pieceId" value={piece.id} />
                      <input name="feedback" placeholder="Quero ajustar..." aria-label="O que você quer ajustar" />
                      <button className={styles.button} type="submit">Ajustar</button>
                    </form>
                  </div>
                ) : (
                  <p className={styles.small}>A decisão estratégica está aprovada. Ela já aparece em Produção para a próxima etapa.</p>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>Precisa de você</h2>
          <p>{data.week ? `${data.week.pieces.filter((p) => p.status === 'proposed').length} decisões aguardando validação.` : 'Nada pendente antes de montar a semana.'}</p>
        </div>
      </section>
    </div>
  );
}
