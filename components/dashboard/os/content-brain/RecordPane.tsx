import type { FunctionalPillar } from '@/modules/content-brain/domain';
import RecordingMode from '../RecordingMode';
import StoryWorkshop from './StoryWorkshop';
import WeeklyFocus, { type WeeklyFocusData } from './WeeklyFocus';
import { PublicationMatch, StoryCandidates, TrialReelConfirm } from './StoryDecisions';

/** «Para gravar»: o topo da tela de Conteúdo.
 *
 *  A ordem é a que reduz decisões: primeiro o que precisa de uma resposta de
 *  um clique, depois o que está pronto, depois o que ainda precisa de
 *  trabalho. Mapear pilar fica no fim — é a ação de quando não há material,
 *  não a ação por omissão.
 *
 *  A ação primária nunca é «gerar ideia». É contar uma situação real. */

export type ReadyItem = {
  id: string;
  title: string;
  point: string | null;
  beats: number;
  durationSeconds: number | null;
  /** Os momentos, já na forma que o modo de gravação lê. */
  shots: { shot: string; note?: string; required?: boolean }[];
  mustNotInvent: string[];
};
export type DevelopingItem = {
  id: string;
  title: string;
  summary: string;
  needsConfirmation: boolean;
  nextStep: string;
  facts: string[];
  meaning: string | null;
  frameLabel: string | null;
};

export default function RecordPane({
  weekly,
  focus,
  ready,
  developing,
  candidates,
  trialToConfirm,
  unlinkedMedia,
  matchOptions,
}: {
  weekly: WeeklyFocusData;
  focus: FunctionalPillar;
  ready: ReadyItem[];
  developing: DevelopingItem[];
  candidates: { id: string; fact: string; question: string; brandName: string | null; source: string }[];
  trialToConfirm: { mediaId: string; caption: string; publishedAt: string; permalink: string | null }[];
  unlinkedMedia: { mediaId: string; caption: string; publishedAt: string }[];
  matchOptions: { storyId: string; title: string; contentIdeaId: string | null }[];
}) {
  return (
    <>
      <WeeklyFocus
        data={weekly}
        mapCta={<StoryWorkshop focus={focus} trigger="Contar uma situação" />}
      />

      {unlinkedMedia.length ? (
        <PublicationMatch media={unlinkedMedia[0]} candidates={matchOptions} />
      ) : null}

      <TrialReelConfirm items={trialToConfirm} />
      <StoryCandidates items={candidates} />

      {ready.length ? (
        <section className="osSection">
          <h2>Pronto para gravar</h2>
          <p className="osNote">Sem decisões editoriais pendentes. É só gravar.</p>
          <div className="osRows">
            {ready.map((r) => (
              <div className="osRow" key={r.id}>
                <div>
                  <span className="osRowName">{r.title}</span>
                  {r.point ? <p className="osRowSub">{r.point}</p> : null}
                  <div className="osMeta">
                    <span className="osTag" data-tone="mute">
                      {r.beats} {r.beats === 1 ? 'momento' : 'momentos'}
                    </span>
                    {r.durationSeconds ? (
                      <span className="osTag" data-tone="mute">~{r.durationSeconds}s</span>
                    ) : null}
                  </div>
                </div>
                <div className="osRowSide">
                  {r.shots.length ? (
                    <RecordingMode
                      contentId={r.id}
                      title={r.title}
                      shots={r.shots}
                      story={{
                        centralPoint: r.point ?? r.title,
                        mustNotInvent: r.mustNotInvent,
                        durationSeconds: r.durationSeconds,
                      }}
                    />
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {developing.length ? (
        <section className="osSection">
          <h2>Histórias para desenvolver</h2>
          <p className="osNote">Situações que você já contou e que ainda não viraram peça.</p>
          <div className="osRows">
            {developing.map((d) => (
              <div className="osRow" key={d.id}>
                <div>
                  <span className="osRowName">{d.title}</span>
                  <p className="osRowSub">{d.summary.slice(0, 130)}</p>
                  <div className="osMeta">
                    <span className="osTag" data-tone={d.needsConfirmation ? 'hot' : 'mute'}>{d.nextStep}</span>
                  </div>
                </div>
                <div className="osRowSide">
                  <StoryWorkshop
                    focus={focus}
                    trigger={d.needsConfirmation ? 'Confirmar' : 'Continuar'}
                    story={{
                      id: d.id,
                      title: d.title,
                      facts: d.facts,
                      meaning: d.meaning,
                      pillar: null,
                      frameLabel: d.frameLabel,
                      hasStructure: Boolean(d.frameLabel),
                      factConfirmed: !d.needsConfirmation,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {ready.length === 0 && developing.length === 0 ? (
        <section className="osSection osQuiet">
          <h2>Não tem nada que precise ser gravado agora.</h2>
          <p className="osNote">
            Quando acontecer alguma coisa que você queira contar, me conte. Eu não invento histórias
            para preencher calendário.
          </p>
          <StoryWorkshop focus={focus} trigger="Contar uma situação" />
        </section>
      ) : null}
    </>
  );
}
