import { requireUser } from '@/lib/auth';
import ContentStudio from '@/components/dashboard/os/ContentStudio';
import { resolveTab, type StudioTab } from '@/components/dashboard/os/studioTabs';
import ContentIntelligence from '@/components/dashboard/os/content-brain/ContentIntelligence';
import Audit from '@/components/dashboard/os/content-brain/Audit';
import WeekPane from '@/components/dashboard/os/content-brain/WeekPane';
import MapPane from '@/components/dashboard/os/content-brain/MapPane';
import ProductionPane from '@/components/dashboard/os/content-brain/ProductionPane';
import LabPane from '@/components/dashboard/os/content-brain/LabPane';
import Community from '@/components/dashboard/os/content-brain/Community';
import ObjectiveOutcomes from '@/components/dashboard/os/content-brain/ObjectiveOutcomes';
import { COMMERCIAL_FOCUS } from '@/modules/content-brain/editorial';
import {
  editorialMap,
  seedEditorialMap,
  strategySettings,
  visualTemplates,
} from '@/modules/content-brain/editorial-service';
import { currentWeek, type ProposalView } from '@/modules/content-brain/week-service';
import { packsFor } from '@/modules/content-brain/pack-service';
import {
  activeLearningRows,
  experiments,
  formatLab,
  radarCreators,
  references,
  RADAR_AUTOMATIC_BLOCKED,
} from '@/modules/content-brain/lab-service';
import { sessions } from '@/modules/content-brain/session-service';
import { communityWindow } from '@/modules/content-brain/community-service';
import { objectiveOutcomes } from '@/modules/content-brain/outcome-service';
import { performanceScreen } from '@/modules/content-brain/screen-service';
import { feedAudit, storyAudit } from '@/modules/content-brain/performance-service';
import { auditScreen } from '@/modules/content-brain/audit-service';
import { isAuditPeriod } from '@/modules/content-brain/audit';
import { schedulerState } from '@/modules/jobs/scheduler';

export const dynamic = 'force-dynamic';

/** A área de Conteúdo é o CarolOS atual.
 *
 * O que ficou de fora desta tela ficou de fora do produto: CRM, inbox,
 * prospecção, dinheiro e a antiga operação comercial. A Carol valida estratégia,
 * produz, publica e o sistema aprende. */
export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; period?: string }>;
}) {
  await requireUser();
  const { tab, period } = await searchParams;

  await seedEditorialMap().catch(() => null);

  const [
    semana,
    mapa,
    definicoes,
    templates,
    laboratorio,
    testes,
    refs,
    radar,
    aprendizados,
    sessoes,
    comunidade,
    objetivos,
    desempenho,
    feed,
    agendador,
  ] = await Promise.all([
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
    objectiveOutcomes({ days: 90, limit: 20 }).catch(() => null),
    performanceScreen().catch(() => null),
    feedAudit(60).catch(() => null),
    schedulerState().catch(() => null),
  ]);

  const aValidar = (semana?.proposals ?? []).filter((p) => p.status === 'to_validate');
  const packs = await packsFor(aValidar.map((p) => p.id)).catch(() => new Map());
  const syncScheduled = Boolean(
    agendador?.rows.some((r) => r.jobName === 'carolos-instagram-sync' && r.active),
  );

  const [historias, auditoria] = await Promise.all([
    storyAudit({ syncScheduled }).catch(() => null),
    auditScreen({ period: isAuditPeriod(period) ? period : '30d' }).catch(() => null),
  ]);

  const prontas = (semana?.readyToProduce ?? []).length;
  const emProducao = (semana?.proposals ?? []).filter((p) => p.status === 'in_production');

  const paraProducao = (list: ProposalView[]) =>
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

  const initial: StudioTab = resolveTab(tab);

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
      </div>

      <ContentStudio
        initial={initial}
        panes={{
          week: semana ? (
            <WeekPane
              week={semana}
              learnings={aprendizados.slice(0, 2)}
              stock={{ ready: prontas, target: definicoes?.stockTarget ?? 3 }}
            />
          ) : (
            <p className="osWarn">Não consegui ler a semana agora. Tente recarregar daqui a pouco.</p>
          ),

          map: mapa ? (
            <MapPane
              pillars={mapa.pillars}
              focus={mapa.focus}
              capacity={definicoes?.weeklyCapacity ?? 3}
              commercialFocus={COMMERCIAL_FOCUS}
            />
          ) : (
            <p className="osWarn">Não consegui ler o mapa agora.</p>
          ),

          production: (
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
              templates={templates.map((t) => ({
                key: t.key,
                label: t.label,
                pendingTokens: t.pendingTokens,
              }))}
              stock={{ ready: prontas, target: definicoes?.stockTarget ?? 3 }}
            />
          ),

          lab: laboratorio ? (
            <LabPane
              formats={laboratorio.formats}
              others={laboratorio.others}
              experiments={testes}
              references={refs}
              radar={radar.map((r) => ({
                id: r.id,
                handle: r.handle,
                platform: r.platform,
                why: r.why,
              }))}
              radarBlocked={RADAR_AUTOMATIC_BLOCKED}
            />
          ) : (
            <p className="osWarn">Não consegui ler o laboratório agora.</p>
          ),

          audit: (
            <>
              {objetivos ? (
                <ObjectiveOutcomes rows={objetivos.rows} unclassified={objetivos.unclassified} />
              ) : null}
              {comunidade ? <Community data={comunidade} /> : null}
              {auditoria ? (
                <Audit
                  screen={auditoria}
                  explore={
                    feed && historias && desempenho ? (
                      <ContentIntelligence
                        pieces={desempenho.pieces}
                        learnings={desempenho.learnings}
                        lastSyncAt={desempenho.lastSyncAt}
                        feed={feed}
                        stories={historias}
                      />
                    ) : (
                      <p className="osWarn">
                        Não consegui abrir o detalhe peça a peça agora. As conclusões acima continuam válidas.
                      </p>
                    )
                  }
                />
              ) : (
                <p className="osWarn">Não consegui ler a auditoria agora. Tente recarregar daqui a pouco.</p>
              )}
            </>
          ),
        }}
      />
    </>
  );
}
