import { requireUser } from '@/lib/auth';
import { formatMoney } from '@/lib/money';
import { formatDate } from '@/lib/time';
import { automationHealth, commercialAnalytics } from '@/modules/analytics/service';
import { nicheById } from '@/modules/brands/niches';

export const dynamic = 'force-dynamic';

/** Análise comercial.
 *
 *  Só conta o que o sistema registou. O Handoff é explícito em que taxa de
 *  resposta, ticket médio e ciclo de venda são hoje desconhecidos — inventar
 *  uma linha de base daria à Carol números falsos para decidir preço, que é
 *  pior do que não ter números nenhuns. */
export default async function AnalyticsPage() {
  await requireUser();
  const [a, health] = await Promise.all([commercialAnalytics(90), automationHealth(30)]);

  return (
    <>
      <div className="dashBar">
        <h1>Análise</h1>
        <span className="dashState">últimos 90 dias</span>
      </div>

      <p className="osNote">
        Contado a partir de {formatDate(a.since)}, e só com o que o sistema observou. O que
        aconteceu antes não foi reconstruído.
      </p>

      <div className="osStats">
        <div className="osStat">
          <b>{a.outreach}</b>
          <span>abordagens</span>
        </div>
        <div className="osStat">
          <b>{a.replies}</b>
          <span>respostas</span>
        </div>
        <div className="osStat">
          {a.replyRate !== null ? <b>{a.replyRate}%</b> : <b><em>—</em></b>}
          <span>taxa de resposta</span>
        </div>
        <div className="osStat">
          <b>{a.positiveReplies}</b>
          <span>respostas qualificadas</span>
        </div>
        <div className="osStat">
          <b>{a.won}</b>
          <span>fechadas</span>
        </div>
        <div className="osStat">
          {a.winRate !== null ? <b>{a.winRate}%</b> : <b><em>—</em></b>}
          <span>taxa de fecho</span>
        </div>
        <div className="osStat">
          <b>{formatMoney(a.cashCents)}</b>
          <span>receita</span>
        </div>
        <div className="osStat">
          {a.averageTicketCents !== null ? <b>{formatMoney(a.averageTicketCents)}</b> : <b><em>—</em></b>}
          <span>ticket médio</span>
        </div>
        <div className="osStat">
          {a.medianCycleDays !== null ? <b>{a.medianCycleDays}d</b> : <b><em>—</em></b>}
          <span>ciclo mediano</span>
        </div>
        <div className="osStat">
          <b>{formatMoney(a.barterValueCents)}</b>
          <span>permuta <em>(não é receita)</em></span>
        </div>
        <div className="osStat">
          <b>{a.paidJobs}</b>
          <span>trabalhos pagos</span>
        </div>
        <div className="osStat">
          <b>{a.barterJobs}</b>
          <span>trabalhos por produto</span>
        </div>
      </div>

      {a.unavailable.length ? (
        <section className="osSection">
          <h2>O que ainda não dá para saber</h2>
          <p className="osNote">
            Prefiro dizer isto do que mostrar um número inventado. Cada um destes preenche-se
            sozinho à medida que o sistema for registando trabalho real.
          </p>
          <div className="osRows">
            {a.unavailable.map((u) => (
              <div className="osRow" key={u.metric}>
                <div>
                  <span className="osRowName" style={{ fontSize: 17 }}>{u.metric}</span>
                  <p className="osRowSub">{u.why}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="osSection">
        <h2>Follow-up</h2>
        <p className="osNote">Quanto pipeline é recuperado por não deixar um lead morrer calado.</p>
        <div className="osStats">
          <div className="osStat">
            <b>{a.followUpsSent}</b>
            <span>enviados</span>
          </div>
          <div className="osStat">
            <b>{a.recoveredByFollowUp}</b>
            <span>conversas retomadas depois</span>
          </div>
        </div>
      </section>

      {a.byNiche.length ? (
        <section className="osSection">
          <h2>Por nicho</h2>
          <div className="osBars">
            {a.byNiche.map((n) => {
              const max = Math.max(...a.byNiche.map((x) => x.opportunities), 1);
              const niche = nicheById(n.niche);
              return (
                <div className="osBar" key={n.niche}>
                  <span>
                    {niche.label}
                    {niche.tier === 'EXCLUDED' ? ' (fora da estratégia)' : ''}
                  </span>
                  <i style={{ width: `${(n.opportunities / max) * 100}%` }} />
                  <b>{n.opportunities} · {n.won} fechada(s)</b>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {a.byChannel.length ? (
        <section className="osSection">
          <h2>Por canal</h2>
          <div className="osRows">
            {a.byChannel.map((c) => (
              <div className="osRow" key={c.channel}>
                <div><span className="osRowName" style={{ fontSize: 17 }}>{c.channel}</span></div>
                <div className="osRowSide">
                  <span>{c.outreach} enviadas</span>
                  <span>{c.replies} respostas</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="osSection">
        <h2>Saúde da automação</h2>
        <p className="osNote">
          Uma sincronização que falha em silêncio destrói a confiança mais depressa do que um erro
          à vista.
        </p>

        <div className="osStats">
          <div className="osStat">
            <b>{health.actionsOpen}</b>
            <span>ações abertas</span>
          </div>
          <div className="osStat">
            <b>{health.followUpsScheduled}</b>
            <span>follow-ups agendados</span>
          </div>
          <div className="osStat">
            <b>{health.duplicatesPrevented}</b>
            <span>mensagens guardadas</span>
          </div>
        </div>

        {health.jobs.length ? (
          <div className="osRows">
            {health.jobs.map((j) => (
              <div className="osRow" key={j.jobType}>
                <div>
                  <span className="osRowName" style={{ fontSize: 17 }}>{j.jobType}</span>
                  <p className="osRowSub">
                    {j.lastAt ? `último a ${formatDate(j.lastAt)}` : 'ainda não correu'}
                  </p>
                </div>
                <div className="osRowSide">
                  <span className="osTag" data-tone="ok">{j.success} ok</span>
                  {j.error ? <span className="osTag" data-tone="bad">{j.error} falhas</span> : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="osRowSub">Nenhum trabalho de fundo correu ainda.</p>
        )}

        {health.aiTasks.length ? (
          <>
            <h3 style={{ marginTop: 26 }}>IA</h3>
            <p className="osNote">
              A taxa de correcção é o sinal que interessa: mostra onde é que o modelo ainda não é de
              confiança.
            </p>
            <div className="osRows">
              {health.aiTasks.map((t) => (
                <div className="osRow" key={t.taskType}>
                  <div>
                    <span className="osRowName" style={{ fontSize: 17 }}>{t.taskType}</span>
                    <p className="osRowSub">
                      {t.runs} corrida(s)
                      {t.avgConfidence !== null ? ` · confiança média ${t.avgConfidence}` : ''}
                    </p>
                  </div>
                  <div className="osRowSide">
                    {t.accepted ? <span className="osTag" data-tone="ok">{t.accepted} aceites</span> : null}
                    {t.edited ? <span className="osTag" data-tone="hot">{t.edited} corrigidas</span> : null}
                    {t.rejected ? <span className="osTag" data-tone="bad">{t.rejected} rejeitadas</span> : null}
                    {t.errors ? <span className="osTag" data-tone="bad">{t.errors} erros</span> : null}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </section>
    </>
  );
}
