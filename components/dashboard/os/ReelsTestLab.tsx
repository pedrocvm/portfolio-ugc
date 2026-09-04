'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import Spinner from '@/components/dashboard/Spinner';
import { pushToast } from '@/components/dashboard/Toasts';
import { makeVariant, promoteToFeed, toggleIntensiveTests } from '@/app/dashboard/content-actions';
import type { ReelsTestLab as Lab } from '@/modules/creator/content-os-service';
import InsightsDrop from './InsightsDrop';

/** O Reels Test Lab, sem framework à vista.
 *
 *  Três coisas: o que está preparado por publicar, o que está no ar e como
 *  vai, e o que parou de crescer acima do normal dela e merece ir para o feed.
 *  Levar ao feed é no Instagram, na mão dela — aqui só se regista que foi. */

const STAGE_LABEL: Record<string, string> = {
  idea: 'por publicar',
  test: 'no ar',
  measure: 'medido',
  learning: 'com aprendizado',
  iteration: 'variante',
  feed_candidate: 'pronto para o feed',
};

export default function ReelsTestLab({ lab }: { lab: Lab }) {
  const [pending, start] = useTransition();
  const [intensivo, setIntensivo] = useState(lab.settings.intensiveTestMode);
  const [feitos, setFeitos] = useState<string[]>([]);
  const [erro, setErro] = useState('');

  const alternar = () =>
    start(async () => {
      const next = !intensivo;
      setIntensivo(next);
      const r = await toggleIntensiveTests(next).catch(() => ({ error: 'Não consegui mudar agora.' }));
      if (r.error) {
        setIntensivo(!next);
        setErro(r.error);
      }
    });

  const levar = (ideaId: string) =>
    start(async () => {
      setErro('');
      const r = await promoteToFeed(ideaId).catch(() => ({ error: 'Não consegui registar agora.' }));
      if (r.error) {
        setErro(r.error);
        return;
      }
      setFeitos((v) => [...v, ideaId]);
      pushToast('Registado como levado ao feed.');
    });

  const variante = (ideaId: string) =>
    start(async () => {
      setErro('');
      const r = await makeVariant(ideaId).catch(() => ({ error: 'Não consegui escrever a variante agora.' }));
      if (r.error) {
        setErro(r.error);
        return;
      }
      pushToast('Variante escrita. Está em «Para gravar».');
    });

  const base = lab.baseline;

  return (
    <>
      <section className="osSection">
        <h2>Hoje</h2>
        <p className="osNote">
          {lab.load.recommended === 0
            ? 'Nenhum teste novo hoje.'
            : `${lab.load.recommended} ${lab.load.recommended === 1 ? 'teste' : 'testes'} hoje.`}{' '}
          {lab.load.because}
        </p>
        <div className="osFlag">
          <div>
            <b>Modo de teste intensivo</b>
            <p>Três a cinco testes por dia, espaçados — a recomendação da mentora. Com gravação de marca no dia, o sistema baixa sozinho para um.</p>
          </div>
          <button className="osSwitch" type="button" aria-pressed={intensivo} disabled={pending} onClick={alternar}>
            {intensivo ? 'ligado' : 'desligado'}
          </button>
        </div>
        <p className="osRowSub">
          {base.medianViews
            ? `Linha de base: ${base.medianViews} views por peça, em ${base.sampleSize} ${base.sampleSize === 1 ? 'peça medida' : 'peças medidas'}.`
            : 'Ainda não há linha de base: cole prints dos Insights e ela nasce sozinha. Até lá, os números da mentora servem de referência, não de veredito.'}
        </p>
        {erro ? <p className="osWarn" role="alert">{erro}</p> : null}
      </section>

      {lab.promotionCandidates.length ? (
        <section className="osSection">
          <h2>Para levar ao feed</h2>
          <div className="osRows">
            {lab.promotionCandidates.map((t) => (
              <div className="osRow" key={t.ideaId}>
                <div>
                  <span className="osRowName">{t.title || t.hook}</span>
                  <p className="osRowSub">{t.promotion?.headline}</p>
                  <p className="osRowSub">{t.promotion?.because}</p>
                </div>
                <div className="osRowSide">
                  {feitos.includes(t.ideaId) ? (
                    <span className="osTag" data-tone="ok">no feed</span>
                  ) : (
                    <>
                      <button className="osGo" type="button" disabled={pending} onClick={() => levar(t.ideaId)}>
                        {pending ? <Spinner label="Registando" /> : null}
                        Levei para o feed
                      </button>
                      <button className="focusSkip" type="button" disabled={pending} onClick={() => setFeitos((v) => [...v, t.ideaId])}>
                        Deixar só no teste
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="osNote">Mover para a grade é no Instagram. O CarolOS não tem como fazer isso por você — e não finge.</p>
        </section>
      ) : null}

      <section className="osSection">
        <h2>
          Preparados <span className="osCount">{lab.ready.length}</span>
        </h2>
        {lab.ready.length ? (
          <div className="osRows">
            {lab.ready.map((r) => (
              <div className="osRow" key={r.ideaId}>
                <div>
                  <span className="osRowName">{r.title || r.hook}</span>
                  <p className="osRowSub">«{r.hook}»</p>
                  {r.hasBroll ? <p className="osRowSub">Usa um B-roll que já existe: não precisa gravar nada novo.</p> : null}
                </div>
                <div className="osRowSide">
                  <Link className="chip" href={`/dashboard/content?idea=${r.ideaId}`}>Ver plano</Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="osRowSub">Nenhum teste preparado. O plano da manhã escreve um quando o dia comporta.</p>
        )}
      </section>

      <section className="osSection">
        <h2>
          No ar <span className="osCount">{lab.running.length}</span>
        </h2>
        {lab.running.length ? (
          <div className="osRows">
            {lab.running.slice(0, 3).map((t) => (
              <div className="osRow" key={t.ideaId}>
                <div>
                  <span className="osRowName">{t.title || t.hook}</span>
                  <p className="osRowSub">
                    <span className="osTag" data-tone="mute">{STAGE_LABEL[t.stage] ?? t.stage}</span>
                    {t.latest ? ` ${t.latest.because}` : ' Ainda sem números: cole um print dos Insights.'}
                  </p>
                  {t.promotion && !t.promotion.candidate && t.measurements.length ? <p className="osRowSub">{t.promotion.because}</p> : null}
                  <InsightsDrop ideaId={t.ideaId} compact />
                </div>
                <div className="osRowSide">
                  <button className="osPageBtn" type="button" disabled={pending} onClick={() => variante(t.ideaId)}>
                    Fazer variante
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="osRowSub">Nenhum teste publicado ainda. Quando marcar um como publicado, aparece aqui.</p>
        )}
      </section>
    </>
  );
}
