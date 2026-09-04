import type { strategyScreen } from '@/modules/creator/content-os-service';

type Screen = Awaited<ReturnType<typeof strategyScreen>>;

/** Estratégia de conteúdo: o que estamos seguindo, testando e aprendendo.
 *
 *  Não é para visitar todos os dias. Regra curta à vista; o porquê e a fonte
 *  abrem ao toque. Muito melhor do que oito páginas de notas da mentoria. */
export default function ContentStrategy({ screen }: { screen: Screen }) {
  const KIND: Record<string, string> = {
    MENTOR_RULE: 'regra da mentoria',
    MENTOR_HEURISTIC: 'heurística da mentoria',
    MENTOR_EXPERIMENT: 'experiência da mentoria',
    CANONICAL_BUSINESS_POLICY: 'decisão do negócio',
    OBSERVED_CAROL_SIGNAL: 'números reais',
  };
  const STATUS: Record<string, string> = { planned: 'por começar', running: 'em curso', measured: 'medida', learned: 'com aprendizado', paused: 'em pausa' };
  const fonte = (kind: string) =>
    kind === 'CANONICAL_BUSINESS_POLICY'
      ? `${screen.mentorSource.provenanceLabel} · Briefing Tech-first`
      : kind === 'OBSERVED_CAROL_SIGNAL'
        ? 'Números reais dela'
        : screen.mentorSource.provenanceLabel;

  return (
    <>
      <section className="osSection">
        <h2>Estamos seguindo</h2>
        <ul className="csRules">
          {screen.following.map((r) => (
            <li key={r.id}>
              <details className="cbSub">
                <summary>
                  <span aria-hidden="true">✓ </span>
                  {r.rule}
                </summary>
                <p className="osRowSub">{r.why}</p>
                <p className="csSource">
                  Fonte: {fonte(r.kind)} · {KIND[r.kind] ?? r.kind}
                </p>
              </details>
            </li>
          ))}
        </ul>
      </section>

      <section className="osSection">
        <h2>Estamos testando</h2>
        <ul className="csRules">
          {screen.testing.map((t) => (
            <li key={t.kind}>
              <details className="cbSub">
                <summary>
                  <span aria-hidden="true">• </span>
                  {t.label}
                  <span className="osTag" data-tone={t.status === 'learned' ? 'ok' : 'mute'} style={{ marginLeft: 8 }}>
                    {STATUS[t.status] ?? t.status}
                    {t.sampleSize ? ` · ${t.sampleSize}` : ''}
                  </span>
                </summary>
                <p className="osRowSub">{t.hypothesis}</p>
                <p className="csSource">Fonte: {screen.mentorSource.provenanceLabel} · experiência da mentoria</p>
              </details>
            </li>
          ))}
          {screen.heuristics
            .filter((h) => h.kind === 'MENTOR_HEURISTIC')
            .map((h) => (
              <li key={h.id}>
                <details className="cbSub">
                  <summary>
                    <span aria-hidden="true">• </span>
                    {h.rule}
                  </summary>
                  <p className="osRowSub">{h.why}</p>
                  <p className="csSource">Fonte: {screen.mentorSource.provenanceLabel} · heurística — a linha de base dela ganha</p>
                </details>
              </li>
            ))}
        </ul>
      </section>

      <section className="osSection">
        <h2>Aprendemos</h2>
        {screen.learned.length ? (
          <ul className="csRules">
            {screen.learned.map((l) => (
              <li key={l.id}>
                {l.statement}
                <p className="csSource">Fonte: números reais · {l.sampleSize} peças · confiança {l.confidence === 'high' ? 'alta' : l.confidence === 'medium' ? 'média' : 'baixa'}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="osRowSub">Ainda nada com dados reais. A auditoria do perfil não conseguiu medir nada, e a mentoria é conselho: os aprendizados nascem dos prints dos Insights.</p>
        )}
      </section>

      <section className="osSection">
        <h2>Quando as fontes discordam</h2>
        <p className="osNote">
          A ordem é fixa: uma decisão dela, depois os números reais, depois a auditoria do perfil, depois a mentoria, depois o palpite. Nada se esconde.
        </p>
        <ul className="csRules">
          {screen.conflicts.map((c) => (
            <li key={c.id}>
              <details className="cbSub">
                <summary>{c.topic}: {c.resolution}</summary>
                <p className="osRowSub">
                  <b>Mentoria:</b> {c.mentor}
                </p>
                <p className="osRowSub">
                  <b>Auditoria:</b> {c.audit}
                </p>
              </details>
            </li>
          ))}
        </ul>
      </section>

      <section className="osSection">
        <h2>Fontes</h2>
        <div className="osRows">
          <div className="osRow">
            <div>
              <span className="osRowName" style={{ fontSize: 17 }}>{screen.mentorSource.name}</span>
              <p className="osRowSub">
                {screen.mentorSource.mentor} · {screen.mentorSource.effectiveAt} · {screen.mentorSource.recordedBy}. Autoridade alta sobre estratégia; nenhuma sobre o algoritmo ou sobre os números dela.
              </p>
            </div>
          </div>
          <div className="osRow">
            <div>
              <span className="osRowName" style={{ fontSize: 17 }}>{screen.auditSource.name}</span>
              <p className="osRowSub">{screen.auditSource.observedAt} · identidade observada em quinze posts e sete criativos; métricas não verificadas.</p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
