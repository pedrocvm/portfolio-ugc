'use client';

import { useState, useTransition } from 'react';
import Spinner from '@/components/dashboard/Spinner';
import { pushUndo } from '@/components/dashboard/Toasts';
import { answerCandidate, answerTrialReel, confirmMediaLink } from '@/app/dashboard/content-brain-actions';

/** As três confirmações que só ela pode dar.
 *
 *  São as únicas perguntas que o Content Brain faz por iniciativa própria, e
 *  cada uma existe porque nenhuma máquina consegue responder:
 *
 *    Trial Reel     — a API não distingue.
 *    Vinculação     — duas histórias parecidas, e errar envenena a medição.
 *    Significado    — só ela sabe o que foi importante.
 *
 *  Todas de baixa pressão e todas com saída. «Não lembro» é resposta e fica
 *  gravada: a pergunta não volta. */

export function TrialReelConfirm({
  items,
}: {
  items: { mediaId: string; caption: string; publishedAt: string; permalink: string | null }[];
}) {
  const [feitos, setFeitos] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const restantes = items.filter((i) => !feitos.includes(i.mediaId));
  const atual = restantes[0];

  if (!atual) return null;

  const responder = (r: 'yes' | 'no' | 'unknown') => {
    start(async () => {
      await answerTrialReel(atual.mediaId, r);
      setFeitos((f) => [...f, atual.mediaId]);
    });
  };

  return (
    <section className="osSection cbConfirm">
      <h2>Esse foi publicado como Reel Test?</h2>
      <p className="cbConfirmWhat">{atual.caption.slice(0, 120) || 'Sem legenda'}</p>
      <p className="osNote">
        O Instagram não me diz isso, e muda a comparação. Pergunto uma vez só.
        {restantes.length > 1 ? ` Faltam ${restantes.length - 1} depois deste.` : ''}
      </p>
      <div className="cbActs">
        <button className="osStart" type="button" disabled={pending} onClick={() => responder('yes')}>
          Sim
        </button>
        <button className="chip" type="button" disabled={pending} onClick={() => responder('no')}>
          Não
        </button>
        <button className="focusSkip" type="button" disabled={pending} onClick={() => responder('unknown')}>
          Não lembro
        </button>
      </div>
      {pending ? <Spinner /> : null}
    </section>
  );
}

export function PublicationMatch({
  media,
  candidates,
}: {
  media: { mediaId: string; caption: string; publishedAt: string };
  candidates: { storyId: string; title: string; contentIdeaId: string | null }[];
}) {
  const [resolvido, setResolvido] = useState(false);
  const [pending, start] = useTransition();
  if (resolvido) return null;

  const ligar = (storyId: string | null, contentIdeaId: string | null, titulo?: string) => {
    start(async () => {
      await confirmMediaLink({ mediaId: media.mediaId, storyId, contentIdeaId });
      setResolvido(true);
      if (storyId) {
        // Desfazer de verdade: volta a desligar e reabre a pergunta.
        pushUndo(`Ligado a «${titulo}».`, async () => {
          await confirmMediaLink({ mediaId: media.mediaId, storyId: null, contentIdeaId: null });
          setResolvido(false);
        });
      }
    });
  };

  return (
    <section className="osSection cbConfirm">
      <h2>Encontrei um conteúdo novo no seu Instagram.</h2>
      <p className="cbConfirmWhat">{media.caption.slice(0, 140) || 'Sem legenda'}</p>
      {candidates.length ? (
        <>
          <p className="osNote">Corresponde a qual história?</p>
          <ul className="cbOptions">
            {candidates.map((c) => (
              <li key={c.storyId}>
                <button type="button" disabled={pending} onClick={() => ligar(c.storyId, c.contentIdeaId, c.title)}>
                  <strong>{c.title}</strong>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="osNote">Não encontrei nenhuma história que combine. Tudo bem — nem tudo passa por aqui.</p>
      )}
      <button className="focusSkip" type="button" disabled={pending} onClick={() => ligar(null, null)}>
        Nenhuma delas
      </button>
    </section>
  );
}

export function StoryCandidates({
  items,
}: {
  items: { id: string; fact: string; question: string; brandName: string | null; source: string }[];
}) {
  const [feitos, setFeitos] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const restantes = items.filter((i) => !feitos.includes(i.id));
  if (restantes.length === 0) return null;

  const responder = (id: string, decision: 'saved' | 'dismissed' | 'private') => {
    start(async () => {
      await answerCandidate(id, decision);
      setFeitos((f) => [...f, id]);
    });
  };

  return (
    <section className="osSection cbCandidates">
      <h2>Talvez valha salvar</h2>
      {restantes.map((c) => (
        <article className="cbCandidate" key={c.id}>
          <p className="cbCandidateSource">{c.brandName ? `${c.brandName}` : 'No seu trabalho'}</p>
          <p className="cbCandidateFact">{c.fact}</p>
          <p className="cbCandidateAsk">{c.question}</p>
          <div className="cbActs">
            <button className="osStart" type="button" disabled={pending} onClick={() => responder(c.id, 'saved')}>
              Salvar na minha jornada
            </button>
            <button className="focusSkip" type="button" disabled={pending} onClick={() => responder(c.id, 'dismissed')}>
              Não é relevante
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}
