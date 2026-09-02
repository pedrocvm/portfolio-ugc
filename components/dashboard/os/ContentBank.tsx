'use client';

import { useState, useTransition } from 'react';
import Spinner from '@/components/dashboard/Spinner';
import { pushToast, pushUndo } from '@/components/dashboard/Toasts';
import { anotherIdea, decideOnIdea } from '@/app/dashboard/morning-actions';
import type { ContentIdeaRow } from '@/modules/creator/plan-service';
import type { TrendRow } from '@/modules/trends/service';
import RecordingMode from './RecordingMode';

/** O conteúdo dela: o de hoje, e o que ficou para depois.
 *
 *  Isto não é um destino que ela tenha de visitar. A operação diária chega ao
 *  Hoje; isto é o arquivo — onde se vai ver o plano inteiro, e onde ficam as
 *  ideias que ela guardou para uma tarde com tempo.
 *
 *  «Mastigado significa mastigado»: cada plano traz gancho, guião falado,
 *  tomadas numeradas, texto no ecrã e os passos de CapCut com tempos. Se ela
 *  precisar de pensar em alguma coisa antes de gravar, o plano falhou. */

const STATUS_LABEL: Record<string, string> = {
  ready: 'pronta para gravar',
  saved: 'guardada',
  recorded: 'gravada',
  published: 'publicada',
  archived: 'arquivada',
  discarded: 'descartada',
};

const NUDGES = [
  { key: 'easier', label: 'mais fácil' },
  { key: 'personal', label: 'mais pessoal' },
  { key: 'educational', label: 'mais educativa' },
  { key: 'edited', label: 'mais editada' },
];

export default function ContentBank({
  today,
  bank,
  trends,
  openId,
}: {
  today: ContentIdeaRow[];
  bank: ContentIdeaRow[];
  trends: TrendRow[];
  openId?: string;
}) {
  const guardadas = bank.filter((i) => i.status === 'saved');
  const feitas = bank.filter((i) => i.status === 'recorded' || i.status === 'published');
  const arquivo = bank.filter((i) => i.status === 'archived' || i.status === 'discarded');

  return (
    <>
      {today.length ? (
        <section className="osSection">
          <h2>Para gravar hoje</h2>
          <p className="osNote">
            Uma para cada plataforma, tratadas de forma diferente de propósito: o Reel republicado no
            TikTok é o erro que faz o TikTok não crescer.
          </p>
          <div className="cbList">
            {today.map((i) => (
              <Idea key={i.id} idea={i} trends={trends} open={openId === i.id || today.length <= 2} />
            ))}
          </div>
        </section>
      ) : (
        <section className="osSection osQuiet">
          <h2>Nada escolhido para hoje.</h2>
          <p className="osNote">
            O plano nasce de madrugada, depois das tendências e dos marcos do negócio. Se não
            apareceu, é porque o trabalho ainda não correu ou não encontrou nada que valesse.
          </p>
        </section>
      )}

      {guardadas.length ? (
        <section className="osSection">
          <h2>
            Guardadas <span className="osCount">{guardadas.length}</span>
          </h2>
          <div className="cbList">
            {guardadas.map((i) => (
              <Idea key={i.id} idea={i} trends={trends} open={openId === i.id} />
            ))}
          </div>
        </section>
      ) : null}

      {feitas.length ? (
        <section className="osSection">
          <h2>
            Já gravadas <span className="osCount">{feitas.length}</span>
          </h2>
          <div className="cbList">
            {feitas.map((i) => (
              <Idea key={i.id} idea={i} trends={trends} open={openId === i.id} />
            ))}
          </div>
        </section>
      ) : null}

      {arquivo.length ? (
        <details className="osRest">
          <summary>
            Arquivo <b>{arquivo.length}</b>
          </summary>
          <div className="cbList">
            {arquivo.map((i) => (
              <Idea key={i.id} idea={i} trends={trends} open={false} />
            ))}
          </div>
        </details>
      ) : null}
    </>
  );
}

function Idea({
  idea,
  trends,
  open,
}: {
  idea: ContentIdeaRow;
  trends: TrendRow[];
  open: boolean;
}) {
  const [pending, start] = useTransition();
  const [status, setStatus] = useState(idea.status);
  const [aTrocar, setATrocar] = useState(false);
  const [erro, setErro] = useState('');

  const usadas = trends.filter((t) => idea.trendIds.includes(t.id));

  const decidir = (novo: string, frase: string) =>
    start(async () => {
      const r = await decideOnIdea(idea.id, novo).catch(() => ({ error: 'Não consegui guardar agora.' }));
      if (r.error) {
        setErro(r.error);
        return;
      }
      const anterior = status;
      setStatus(novo);
      pushUndo(frase, async () => {
        await decideOnIdea(idea.id, anterior);
        setStatus(anterior);
      });
    });

  const trocar = (nudge: string) =>
    start(async () => {
      setErro('');
      const r = await anotherIdea(idea.id, nudge).catch(() => ({ error: 'Não consegui escrever outra agora.' }));
      if (r.error) {
        setErro(r.error);
        return;
      }
      setStatus('discarded');
      pushToast('Escrevi outra. Está aqui em cima.');
    });

  return (
    <details className="cbIdea" open={open} data-platform={idea.platform} data-status={status}>
      <summary>
        <span className="cbPlat">{idea.platform === 'instagram' ? 'Instagram' : 'TikTok'}</span>
        <span className="cbTitle">{idea.title || idea.hook}</span>
        <span className="cbTime">
          {idea.recordMinutes ? `${idea.recordMinutes} min para gravar` : ''}
          {idea.editMinutes ? ` · ${idea.editMinutes} min para editar` : ''}
        </span>
        {status !== 'ready' ? <span className="osTag" data-tone="mute">{STATUS_LABEL[status] ?? status}</span> : null}
      </summary>

      <div className="cbBody">
        <p className="cbHook">«{idea.hook}»</p>
        {idea.whyNow ? (
          <p className="cbWhy">
            <b>Porquê hoje:</b> {idea.whyNow}
          </p>
        ) : null}
        <p className="cbMeta">
          {idea.pillarLabel}
          {idea.format ? ` · ${idea.format}` : ''}
          {idea.durationSeconds ? ` · ~${idea.durationSeconds}s` : ''}
          {idea.seriesName ? ` · série «${idea.seriesName}»${idea.episode ? ` #${idea.episode}` : ''}` : ''}
        </p>
        {idea.verdict ? <p className="cbVerdict">{idea.verdict}</p> : null}

        {idea.altHooks.length ? (
          <details className="cbSub">
            <summary>Outros ganchos</summary>
            <ul>
              {idea.altHooks.map((h, i) => (
                <li key={i}>«{h}»</li>
              ))}
            </ul>
          </details>
        ) : null}

        {idea.script ? (
          <div className="cbBlock">
            <h4>Guião</h4>
            <p className="cbScript">{idea.script}</p>
          </div>
        ) : null}

        {idea.shotList.length ? (
          <div className="cbBlock">
            <h4>Tomadas</h4>
            <ol className="cbShots">
              {idea.shotList.map((s, i) => (
                <li key={i}>
                  {s.shot}
                  {s.note ? <span> — {s.note}</span> : null}
                  {s.required === false ? <span className="cbOpt"> (opcional)</span> : null}
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        {idea.bRoll.length || idea.onScreenText.length ? (
          <div className="cbBlock">
            <dl className="cbPlan">
              {idea.bRoll.length ? (
                <>
                  <dt>B-roll</dt>
                  <dd>{idea.bRoll.join(' · ')}</dd>
                </>
              ) : null}
              {idea.onScreenText.length ? (
                <>
                  <dt>Texto no ecrã</dt>
                  <dd>{idea.onScreenText.join(' · ')}</dd>
                </>
              ) : null}
              {idea.editing.camera ? (
                <>
                  <dt>Câmara</dt>
                  <dd>{idea.editing.camera}</dd>
                </>
              ) : null}
              {idea.editing.location ? (
                <>
                  <dt>Onde</dt>
                  <dd>{idea.editing.location}</dd>
                </>
              ) : null}
              {idea.editing.props.length ? (
                <>
                  <dt>Adereços</dt>
                  <dd>{idea.editing.props.join(', ')}</dd>
                </>
              ) : null}
            </dl>
          </div>
        ) : null}

        {idea.editing.capcut.length || idea.editing.transitions.length ? (
          <div className="cbBlock">
            <h4>Edição</h4>
            {idea.editing.capcut.length ? (
              <ol className="cbSteps">
                {idea.editing.capcut.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            ) : null}
            <dl className="cbPlan">
              {idea.editing.transitions.length ? (
                <>
                  <dt>Transições</dt>
                  <dd>{idea.editing.transitions.join(' · ')}</dd>
                </>
              ) : null}
              {idea.editing.pacing ? (
                <>
                  <dt>Ritmo</dt>
                  <dd>{idea.editing.pacing}</dd>
                </>
              ) : null}
              {idea.editing.sound ? (
                <>
                  <dt>Som</dt>
                  <dd>{idea.editing.sound}</dd>
                </>
              ) : null}
            </dl>
          </div>
        ) : null}

        {idea.caption ? (
          <div className="cbBlock">
            <h4>Legenda</h4>
            <p className="cbCaption">{idea.caption}</p>
            {idea.cta ? <p className="cbMeta">Remate: {idea.cta}</p> : null}
            {idea.cover ? <p className="cbMeta">Capa: {idea.cover}</p> : null}
            {idea.postingNotes ? <p className="cbMeta">{idea.postingNotes}</p> : null}
          </div>
        ) : null}

        {idea.authoritySignal || idea.engagementMechanism ? (
          <div className="cbBlock">
            <dl className="cbPlan">
              {idea.authoritySignal ? (
                <>
                  <dt>O que a marca vê</dt>
                  <dd>{idea.authoritySignal}</dd>
                </>
              ) : null}
              {idea.engagementMechanism ? (
                <>
                  <dt>Porque se comenta</dt>
                  <dd>{idea.engagementMechanism}</dd>
                </>
              ) : null}
            </dl>
          </div>
        ) : null}

        {/* Cada tendência usada é clicável. Sem prova, não se afirma que uma
            coisa está a funcionar. */}
        {usadas.length ? (
          <div className="cbBlock">
            <h4>De onde veio</h4>
            <ul className="cbRefs">
              {usadas.map((t) => (
                <li key={t.id}>
                  {t.evidence[0]?.url ? (
                    <a href={t.evidence[0].url} target="_blank" rel="noreferrer noopener">
                      {t.title}
                    </a>
                  ) : (
                    t.title
                  )}
                  <span className="cbMeta"> — {t.whyTrending}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {erro ? (
          <p className="osWarn" role="alert">
            {erro}
          </p>
        ) : null}

        {aTrocar ? (
          <div className="mornNudges">
            <span className="mornNudgeLabel">Como deve ser a próxima?</span>
            {NUDGES.map((n) => (
              <button key={n.key} type="button" disabled={pending} onClick={() => trocar(n.key)}>
                {pending ? <Spinner label="A escrever" /> : null}
                {n.label}
              </button>
            ))}
          </div>
        ) : null}

        <footer className="osCardActs">
          {idea.shotList.length ? (
            <RecordingMode
              contentId={idea.id}
              title={idea.title || idea.hook}
              shots={idea.shotList.map((s) => ({ shot: s.shot, note: s.note, required: s.required }))}
            />
          ) : null}

          {status === 'ready' ? (
            <button
              className="osPageBtn"
              type="button"
              disabled={pending}
              onClick={() => decidir('saved', 'Guardada para depois.')}
            >
              Guardar para depois
            </button>
          ) : null}

          {status !== 'recorded' && status !== 'published' ? (
            <button
              className="osPageBtn"
              type="button"
              disabled={pending}
              onClick={() => decidir('recorded', 'Marcada como gravada.')}
            >
              Já gravei
            </button>
          ) : (
            <button
              className="osPageBtn"
              type="button"
              disabled={pending}
              onClick={() => decidir('published', 'Marcada como publicada.')}
            >
              Já publiquei
            </button>
          )}

          <button className="osPageBtn" type="button" disabled={pending} onClick={() => setATrocar((v) => !v)}>
            Quero outra
          </button>

          <button
            className="focusSkip"
            type="button"
            disabled={pending}
            onClick={() => decidir('discarded', 'Descartada.')}
          >
            Não é para mim
          </button>
        </footer>
      </div>
    </details>
  );
}
