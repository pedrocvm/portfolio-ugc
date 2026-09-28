import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { label } from '@/lib/labels';
import { CAPABILITY_LABEL, FUNNEL_LABEL, capabilityInventory, listContent, type FunnelRole } from '@/modules/content/service';
import { contentBank, todayContent } from '@/modules/creator/plan-service';
import {
  bragaSeries,
  brollBank,
  contentLearnings,
  latestPerformanceByIdea,
  reelsTestLab,
  seedFromMentor,
  socialProofVault,
  strategyScreen,
} from '@/modules/creator/content-os-service';
import { planFromStructure } from '@/modules/content-brain/domain';
import { contentScreen, performanceScreen, toBankRows } from '@/modules/content-brain/screen-service';
import { feedAudit, storyAudit } from '@/modules/content-brain/performance-service';
import { auditScreen } from '@/modules/content-brain/audit-service';
import { isAuditPeriod } from '@/modules/content-brain/audit';
import { schedulerState } from '@/modules/jobs/scheduler';
import { guideEntry } from '@/modules/content-brain/guide-service';
import { usableTrends } from '@/modules/trends/service';
import ContentBank from '@/components/dashboard/os/ContentBank';
import ContentStrategy from '@/components/dashboard/os/ContentStrategy';
import ContentStudio from '@/components/dashboard/os/ContentStudio';
import { resolveTab, type StudioTab } from '@/components/dashboard/os/studioTabs';
import ContentVault from '@/components/dashboard/os/ContentVault';
import Published from '@/components/dashboard/os/Published';
import ReelsTestLab from '@/components/dashboard/os/ReelsTestLab';
import ContentGuide from '@/components/dashboard/os/content-brain/ContentGuide';
import ContentIntelligence from '@/components/dashboard/os/content-brain/ContentIntelligence';
import Audit from '@/components/dashboard/os/content-brain/Audit';
import RecordPane from '@/components/dashboard/os/content-brain/RecordPane';
import { PublicationMatch, StoryCandidates, TrialReelConfirm } from '@/components/dashboard/os/content-brain/StoryDecisions';
import StoryBank from '@/components/dashboard/os/content-brain/StoryBank';
import WeekPane from '@/components/dashboard/os/content-brain/WeekPane';
import MapPane from '@/components/dashboard/os/content-brain/MapPane';
import ProductionPane from '@/components/dashboard/os/content-brain/ProductionPane';
import LabPane from '@/components/dashboard/os/content-brain/LabPane';
import Community from '@/components/dashboard/os/content-brain/Community';
import { COMMERCIAL_FOCUS } from '@/modules/content-brain/editorial';
import { editorialMap, seedEditorialMap, strategySettings, visualTemplates } from '@/modules/content-brain/editorial-service';
import { currentWeek } from '@/modules/content-brain/week-service';
import { packFor } from '@/modules/content-brain/pack-service';
import { activeLearningRows, experiments, formatLab, radarCreators, references, RADAR_AUTOMATIC_BLOCKED } from '@/modules/content-brain/lab-service';
import { sessions } from '@/modules/content-brain/session-service';
import { communityWindow } from '@/modules/content-brain/community-service';

export const dynamic = 'force-dynamic';

/** O Conteúdo.
 *
 *  Para gravar, testes, publicado, banco — e a estratégia atrás, para quando
 *  ela quiser aprofundar. O conteúdo dela e o conteúdo das marcas vivem na
 *  mesma tela de propósito: são o mesmo trabalho visto de dois lados. */
export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<{ idea?: string; tab?: string; find?: string; period?: string }>;
}) {
  await requireUser();
  const { idea, tab, find, period } = await searchParams;

  // Idempotente e barato: os assuntos confirmados, o foco atual, os quatro
  // templates-mãe, e o que a mentoria já semeava. Nada disto chama a Meta nem
  // um modelo: a Semana carrega da base.
  await Promise.all([
    seedFromMentor().catch(() => null),
    seedEditorialMap().catch(() => null),
  ]);

  const [content, inventory, hoje, banco, trends, lab, broll, braga, proof, screen, learnings, performance, brain, desempenho, guia, feed, agendador] = await Promise.all([
    listContent(),
    capabilityInventory(),
    todayContent().catch(() => []),
    contentBank().catch(() => []),
    usableTrends(8).catch(() => []),
    reelsTestLab(),
    brollBank(40),
    bragaSeries(),
    socialProofVault(),
    strategyScreen(),
    contentLearnings(3),
    latestPerformanceByIdea(),
    contentScreen(),
    performanceScreen(),
    guideEntry(),
    feedAudit(60).catch(() => null),
    schedulerState().catch(() => null),
  ]);
  const [semana, mapa, definicoes, templates, laboratorio, testes, refs, radar, aprendizados, sessoes, comunidade] = await Promise.all([
    currentWeek().catch(() => null),
    editorialMap().catch(() => null),
    strategySettings().catch(() => null),
    visualTemplates().catch(() => []),
    formatLab().catch(() => null),
    experiments().catch(() => []),
    references({ limit: 12 }).catch(() => []),
    radarCreators().catch(() => []),
    activeLearningRows({ limit: 4 }).catch(() => []),
    sessions().catch(() => null),
    communityWindow({ days: 30 }).catch(() => null),
  ]);

  // Os packs das peças que esperam por ela. Um pedido por proposta, e só das
  // que estão nesse estado — não das dez da semana passada.
  const aValidar = (semana?.proposals ?? []).filter((p) => p.status === 'to_validate');
  const packs = new Map(
    (await Promise.all(aValidar.map(async (p) => [p.id, await packFor(p.id).catch(() => null)] as const)))
      .filter(([, v]) => v !== null),
  );

  // Só depois de saber se a captura está ligada: a cobertura de Stories diz
  // «não está ligada» ou «desde tal dia», nunca «0 Stories».
  const syncScheduled = Boolean(agendador?.rows.some((r) => r.jobName === 'carolos-instagram-sync' && r.active));
  // A Auditoria lê o que o trabalho da madrugada gravou: nenhuma chamada à
  // Meta ao renderizar, e a tela abre mesmo com a integração em baixo. As duas
  // são independentes e vão juntas — em série custavam uma ida à base a mais.
  const [historias, auditoria] = await Promise.all([
    storyAudit({ syncScheduled }).catch(() => null),
    auditScreen({ period: isAuditPeriod(period) ? period : '30d' }).catch(() => null),
  ]);

  const byRole = (role: FunnelRole) => content.filter((c) => c.funnelRole === role);
  const publicadas = banco.filter((i) => i.status === 'recorded' || i.status === 'published');
  // As peças que nasceram de uma história já têm casa: «Pronto para gravar» e
  // o Banco de histórias. Repeti-las como «ideia salva» era a mesma coisa duas
  // vezes na mesma tela.
  const salvas = banco.filter((i) => i.status === 'saved' && !i.storyId);
  const sementes = banco.filter((i) => i.status === 'seed');

  const initial: StudioTab = resolveTab(tab);

  const prontas = (semana?.readyToProduce ?? []).length;
  const emProducao = (semana?.proposals ?? []).filter((p) => p.status === 'in_production');

  const paraProducao = (list: typeof aValidar) =>
    list.map((p) => ({
      proposalId: p.id,
      title: p.topicLabel,
      angle: p.angle,
      status: p.status,
      statusLabel: p.statusLabel,
      formatLabel: p.formatLabel,
      pack: (() => {
        const pk = packs.get(p.id);
        return pk
          ? {
              id: pk.id,
              proposalId: pk.proposalId,
              kindLabel: pk.kindLabel,
              deliverables: pk.deliverables,
              payload: pk.payload,
              gaps: pk.gaps,
              status: pk.status,
              templateKey: pk.templateKey,
            }
          : null;
      })(),
    }));

  return (
    <>
      <div className="dashBar">
        <h1>Conteúdo</h1>
        <span className="dashState">
          {semana?.needsYou.length
            ? `${semana.needsYou.length} ${semana.needsYou.length === 1 ? 'decisão sua' : 'decisões suas'}`
            : prontas
              ? `${prontas} ${prontas === 1 ? 'pronta para produzir' : 'prontas para produzir'}`
              : 'semana em aberto'}
        </span>
        {/* Ao lado do estado, não ao lado da ação: quem vem trabalhar não
            tropeça nele, e quem não sabe por onde começar encontra-o onde
            olha primeiro. */}
        <ContentGuide focus={brain.focus} offerFirstRun={guia.offerFirstRun} resumeAt={guia.resumeAt} />
      </div>

      <ContentStudio
        key={`${tab ?? ''}:${idea ?? ''}`}
        initial={initial}
        panes={{
          week: (
            <>
              {/* As três confirmações que só ela pode dar vêm antes do plano:
                  são de um clique e destravam a medição do resto. */}
              {unlinkedMedia(brain) ? <PublicationMatch media={brain.unlinkedMedia[0]} candidates={brain.ready.concat(brain.developing).slice(0, 4).map((s2) => ({ storyId: s2.id, title: s2.title, contentIdeaId: null }))} /> : null}
              <TrialReelConfirm items={brain.trialToConfirm} />
              <StoryCandidates items={brain.candidates.map((c) => ({ id: c.id, fact: c.fact, question: c.question, brandName: c.brandName, source: c.source }))} />

              {semana ? (
                <WeekPane
                  week={semana}
                  learnings={aprendizados.slice(0, 2)}
                  stock={{ ready: prontas, target: definicoes?.stockTarget ?? 3 }}
                />
              ) : (
                <p className="osWarn">Não consegui ler a semana agora. Tente recarregar daqui a pouco.</p>
              )}
            </>
          ),
          map: mapa ? (
            <>
              <MapPane
                pillars={mapa.pillars}
                focus={mapa.focus}
                capacity={definicoes?.weeklyCapacity ?? 3}
                commercialFocus={COMMERCIAL_FOCUS}
              />
              <h2 className="osDivider">O que você já contou</h2>
              <StoryBank
                stories={toBankRows(brain.stories, new Set(brain.stories.filter((s2) => s2.contentIdeaIds.length).map((s2) => s2.id)))}
                focus={brain.focus}
              />
              <ContentVault saved={salvas} seeds={sementes} broll={broll} braga={braga} proof={proof} />
              <h2 className="osDivider">A estratégia por trás</h2>
              <ContentStrategy screen={screen} />
            </>
          ) : (
            <p className="osWarn">Não consegui ler o mapa agora.</p>
          ),
          production: (
            <>
              <ProductionPane
                toValidate={paraProducao(aValidar)}
                ready={paraProducao(semana?.readyToProduce ?? [])}
                inProduction={paraProducao(emProducao)}
                groups={(sessoes?.groups ?? []).map((g) => ({
                  key: g.key,
                  label: g.label,
                  shared: g.shared,
                  needsOuting: g.needsOuting,
                  checklist: g.checklist,
                  items: g.items.map((i) => ({ proposalId: i.proposalId, title: i.title })),
                }))}
                savedSessions={sessoes?.saved ?? []}
                templates={templates.map((t) => ({ key: t.key, label: t.label, pendingTokens: t.pendingTokens }))}
                stock={{ ready: prontas, target: definicoes?.stockTarget ?? 3 }}
              />

              <h2 className="osDivider">Matéria-prima</h2>
              <RecordPane
                autoFind={Boolean(find)}
                weekly={brain.weekly}
                focus={brain.focus}
                ready={brain.ready.map((r) => {
                  const plano = planFromStructure(r.structure);
                  return {
                    id: r.id,
                    title: r.title,
                    point: plano.centralPoint ?? r.frameLabel,
                    beats: plano.moments.length,
                    durationSeconds: plano.durationSeconds,
                    shots: plano.shots,
                    mustNotInvent: plano.mustNotInvent,
                    moments: plano.moments,
                    script: plano.script,
                  };
                })}
                developing={brain.developing.map((d) => ({
                  id: d.id,
                  title: d.title,
                  summary: d.summary,
                  needsConfirmation: d.factStatus !== 'confirmed',
                  nextStep:
                    d.factStatus !== 'confirmed'
                      ? 'falta confirmar os fatos'
                      : !d.pillar
                        ? 'falta a função'
                        : !d.frameLabel
                          ? 'falta escolher o ponto'
                          : 'falta a estrutura',
                  facts: d.facts.map((f) => f.text),
                  meaning: d.carolMeaning,
                  frameLabel: d.frameLabel,
                }))}
                candidates={[]}
                trialToConfirm={[]}
                unlinkedMedia={[]}
                matchOptions={[]}
              />
              <ContentBank today={hoje} bank={banco.filter((i) => i.status !== 'seed' && !(i.storyId && i.status === 'saved'))} trends={trends} openId={idea} />
            </>
          ),
          lab: (
            <>
              {laboratorio ? (
                <LabPane
                  formats={laboratorio.formats}
                  others={laboratorio.others}
                  experiments={testes}
                  references={refs}
                  radar={radar.map((r) => ({ id: r.id, handle: r.handle, platform: r.platform, why: r.why }))}
                  radarBlocked={RADAR_AUTOMATIC_BLOCKED}
                />
              ) : (
                <p className="osWarn">Não consegui ler o laboratório agora.</p>
              )}
              <h2 className="osDivider">Reels Test</h2>
              <ReelsTestLab lab={lab} />
            </>
          ),
          // A Auditoria é a casa de tudo o que o Instagram ensina. O detalhe
          // peça a peça continua a ser o mesmo componente — dentro dela, em
          // «Explorar dados», e não repetido noutra aba.
          audit: (
            <>
              {comunidade ? <Community data={comunidade} /> : null}
              {auditoria ? (
                <Audit
                  screen={auditoria}
                  explore={
                    feed && historias ? (
                      <ContentIntelligence
                        pieces={desempenho.pieces}
                        learnings={desempenho.learnings}
                        lastSyncAt={desempenho.lastSyncAt}
                        feed={feed}
                        stories={historias}
                      />
                    ) : (
                      <p className="osWarn">Não consegui abrir o detalhe peça a peça agora. As conclusões acima continuam válidas.</p>
                    )
                  }
                />
              ) : (
                <p className="osWarn">Não consegui ler a auditoria agora. Tente recarregar daqui a pouco.</p>
              )}
              <h2 className="osDivider">Publicado</h2>
              <Published pieces={publicadas} performance={Object.fromEntries(performance)} learnings={learnings} />
              <BrandPieces content={content} inventory={inventory} byRole={byRole} />
            </>
          ),
        }}
      />
    </>
  );
}

/** Existe uma mídia publicada por ligar a uma história? A pergunta é de um
 *  clique e destrava a medição das outras, por isso vive na Semana. */
function unlinkedMedia(brain: Awaited<ReturnType<typeof contentScreen>>) {
  return brain.unlinkedMedia.length > 0;
}

/** O portfólio como banco de capacidades. Serve para responder a uma pergunta
 *  concreta: quando uma marca pede um exemplo, qual é a peça que responde à
 *  dúvida dela? E, do outro lado, que competência ainda falta demonstrar. */
function BrandPieces({
  content,
  inventory,
  byRole,
}: {
  content: Awaited<ReturnType<typeof listContent>>;
  inventory: Awaited<ReturnType<typeof capabilityInventory>>;
  byRole: (role: FunnelRole) => Awaited<ReturnType<typeof listContent>>;
}) {
  return (
    <>
      <h2 className="osDivider">Para as marcas</h2>
      <p className="osNote">
        Cada peça é uma hipótese com uma função no funil e uma competência demonstrada. É isto que
        permite escolher o exemplo certo em vez de mandar o portfólio inteiro.
      </p>

      {inventory.length ? (
        <section className="osSection">
          <h2>Repertório</h2>
          <div className="osBars">
            {inventory.map((c) => {
              const max = Math.max(...inventory.map((x) => x.count), 1);
              return (
                <div className="osBar" key={c.capability}>
                  <span>{CAPABILITY_LABEL[c.capability] ?? c.capability}</span>
                  <i style={{ width: `${(c.count / max) * 100}%` }} />
                  <b>{c.count}</b>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {(['DISCOVERY', 'CONSIDERATION', 'DECISION'] as FunnelRole[]).map((role) => {
        const list = byRole(role);
        if (!list.length) return null;
        return (
          <section className="osSection" key={role}>
            <h2>{FUNNEL_LABEL[role]}</h2>
            <div className="osRows">
              {list.map((c) => (
                <div className="osRow" key={c.id}>
                  <div>
                    <span className="osRowName">{c.title}</span>
                    <p className="osRowSub">
                      {c.brandName}
                      {c.hook ? ` · ${c.hook}` : ''}
                    </p>
                    {c.capabilities.length ? (
                      <div className="osMeta">
                        {c.capabilities.map((x) => (
                          <span key={x} className="osTag" data-tone="mute">
                            {CAPABILITY_LABEL[x] ?? x}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="osRowSide">
                    <span className="osTag" data-tone={c.status === 'approved' ? 'won' : 'mute'}>
                      {label('contentStatus', c.status)}
                    </span>
                    {c.collaborationId ? (
                      <Link className="chip" href={`/dashboard/production/${c.collaborationId}`}>Abrir</Link>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {content.filter((c) => !c.funnelRole).length ? (
        <section className="osSection">
          <h2>Sem função definida</h2>
          <p className="osNote">Uma peça sem papel no funil é um arquivo, não um argumento de venda.</p>
          <div className="osRows">
            {content.filter((c) => !c.funnelRole).map((c) => (
              <div className="osRow" key={c.id}>
                <div>
                  <span className="osRowName">{c.title}</span>
                  <p className="osRowSub">{c.brandName}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {content.length === 0 ? (
        <p className="osEmpty">
          Ainda não há conteúdo planeado para marcas. As peças nascem dentro de uma colaboração, em Produção.
        </p>
      ) : null}
    </>
  );
}
