'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import Spinner from '@/components/dashboard/Spinner';
import { useExit } from '@/components/dashboard/useExit';
import { pushToast, pushUndo } from '@/components/dashboard/Toasts';
import {
  anotherIdea,
  decideOnIdea,
  finishMorning,
  openMorning,
  postponeReply,
  sendPreparedReply,
} from '@/app/dashboard/morning-actions';
import type { Decision } from '@/modules/morning/domain';
import { REJECTION_REASONS, type RejectionReason } from '@/modules/creator/domain';

/** A manhã, uma decisão de cada vez.
 *
 *  A diferença para o modo focus antigo é a única que interessa: aqui a ação
 *  produtiva RESOLVE-SE dentro da fila. Antes, das quatro escolhas, três faziam
 *  avançar e a única que trabalhava navegava para fora e destruía a fila — o
 *  modo focus só funcionava para quem não queria trabalhar.
 *
 *  Cada tipo de decisão tem a sua própria forma, mas a arquitectura é a mesma:
 *  resumo por cima, ação preparada no meio, e três botões — fazer, mudar,
 *  depois. */

/** Os motivos pela ordem em que ela pensa neles: primeiro «isto não sou eu». */
const MOTIVOS = Object.entries(REJECTION_REASONS) as [RejectionReason, string][];

type Payload = Record<string, unknown>;
const str = (p: Payload | undefined, k: string) => (typeof p?.[k] === 'string' ? (p[k] as string) : '');
const num = (p: Payload | undefined, k: string) => (typeof p?.[k] === 'number' ? (p[k] as number) : null);

export default function MorningFlow({
  decisions,
  closing,
  prepared,
}: {
  decisions: Decision[];
  closing: string;
  prepared: string[];
}) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(0);
  const [resolvidas, setResolvidas] = useState<string[]>([]);
  const { closing: aFechar, close } = useExit(() => setOpen(false), 220);
  const caixa = useRef<HTMLDivElement>(null);

  const restantes = decisions.filter((d) => !resolvidas.includes(d.id));
  const atual = restantes[Math.min(at, Math.max(0, restantes.length - 1))];
  const acabou = restantes.length === 0;

  const abrir = useCallback(() => {
    setAt(0);
    setResolvidas([]);
    setOpen(true);
    // Marcar que abriu é telemetria: se falhar, a manhã abre na mesma.
    void openMorning().catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    caixa.current?.focus();
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  // Quando a última sai da fila, a manhã fica marcada como fechada. É o que
  // permite medir quanto tempo ela demora mesmo, em vez de estimar para sempre.
  useEffect(() => {
    if (open && acabou && decisions.length > 0) void finishMorning().catch(() => {});
  }, [open, acabou, decisions.length]);

  if (decisions.length === 0) return null;

  const resolver = (id: string) => setResolvidas((v) => [...v, id]);

  const total = decisions.length;
  const posicao = total - restantes.length + 1;

  return (
    <>
      <button className="osStart" type="button" onClick={abrir}>
        Começar a manhã
        <span aria-hidden="true">→</span>
      </button>

      {open ? (
        <div className="focus" data-closing={aFechar || undefined}>
          <button className="pickScrim" type="button" aria-label="Fechar" onClick={close} />
          <div
            className="focusBox mornBox"
            role="dialog"
            aria-modal="true"
            aria-label="A manhã"
            tabIndex={-1}
            ref={caixa}
          >
            <header className="focusTop">
              <span className="focusAt">{acabou ? 'Terminado' : `${posicao} de ${total}`}</span>
              <button type="button" onClick={close} aria-label="Fechar">
                ×
              </button>
            </header>

            <div className="focusBar" aria-hidden="true">
              <span style={{ '--p': `${((total - restantes.length) / total) * 100}%` } as React.CSSProperties} />
            </div>

            {acabou ? (
              <div className="focusDone">
                <h2>Pronto.</h2>
                <p>{closing}</p>
                {prepared.length ? (
                  <p className="osNote mornProof">
                    Esta manhã: {prepared.join(', ')}.
                  </p>
                ) : null}
                <button className="osStart" type="button" onClick={close}>
                  Fechar
                </button>
              </div>
            ) : atual ? (
              <Step key={atual.id} decision={atual} onResolved={() => resolver(atual.id)} onSkip={() => resolver(atual.id)} />
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

/* ── Um passo ─────────────────────────────────────────────────────────────── */

function Step({
  decision,
  onResolved,
  onSkip,
}: {
  decision: Decision;
  onResolved: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="focusOne">
      <span className="osBrand">{decision.subject}</span>
      <h2>{decision.headline}</h2>
      {decision.because ? <p className="focusWhy">{decision.because}</p> : null}

      {decision.kind === 'reply' ? (
        <ReplyStep decision={decision} onResolved={onResolved} onSkip={onSkip} />
      ) : decision.kind === 'content' ? (
        <ContentStep decision={decision} onResolved={onResolved} onSkip={onSkip} />
      ) : (
        <LinkStep decision={decision} onSkip={onSkip} />
      )}
    </div>
  );
}

/** Resposta: resumo, recomendação, mensagem pronta, e um botão de enviar.
 *
 *  Os nove passos entre «a marca respondeu» e «a Carol enviou» acabam aqui. */
function ReplyStep({
  decision,
  onResolved,
  onSkip,
}: {
  decision: Decision;
  onResolved: () => void;
  onSkip: () => void;
}) {
  const p = decision.payload as Payload | undefined;
  const original = str(p, 'draftBody');
  const [texto, setTexto] = useState(original);
  const [aEditar, setAEditar] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [erro, setErro] = useState('');
  const [pending, start] = useTransition();

  const threadId = str(p, 'threadId');
  const falta = str(p, 'whatIsMissing');
  const risco = str(p, 'risk');
  const mudou = str(p, 'whatChanged');
  const para = str(p, 'replyTo');

  const enviar = () =>
    start(async () => {
      setErro('');
      const r = await sendPreparedReply({
        threadId,
        body: texto,
        subject: str(p, 'draftSubject'),
        aiDraft: original,
      }).catch(() => ({ error: 'Não consegui enviar agora. A mensagem continua aqui.' }));
      if (r.error) {
        setErro(r.error);
        setConfirmar(false);
        return;
      }
      onResolved();
    });

  const depois = () =>
    start(async () => {
      // Se adiar falhar, o cartão fica onde está e diz porquê. Avançar na
      // mesma dava a impressão de que estava tratado quando não estava.
      const r = await postponeReply(threadId).catch(() => ({ error: 'Não consegui adiar agora.' }));
      if (r.error) {
        setErro(r.error);
        return;
      }
      pushToast(`A resposta à ${decision.subject} volta amanhã.`);
      onSkip();
    });

  return (
    <>
      <dl className="mornFacts">
        {mudou ? (
          <>
            <dt>O que mudou</dt>
            <dd>{mudou}</dd>
          </>
        ) : null}
        {falta ? (
          <>
            <dt>O que falta</dt>
            <dd>{falta}</dd>
          </>
        ) : null}
        {risco ? (
          <>
            <dt>Risco</dt>
            <dd data-risk={str(p, 'riskLevel') || undefined}>{risco}</dd>
          </>
        ) : null}
      </dl>

      {aEditar ? (
        <textarea
          className="mornDraft"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={12}
          aria-label="Mensagem"
        />
      ) : (
        <div className="mornMsg">
          <p className="mornTo">{para ? `Para ${para}` : 'Mensagem pronta'}</p>
          <p className="mornSubject">{str(p, 'draftSubject')}</p>
          <div className="mornBody">
            {/* Parágrafos, não linhas: um email tem linhas em branco a separar,
                e desenhá-las como parágrafos vazios abria buracos no meio. */}
            {texto
              .split(/\n\s*\n/)
              .map((bloco) => bloco.trim())
              .filter(Boolean)
              .map((paragrafo, i) => (
                <p key={i}>{paragrafo}</p>
              ))}
          </div>
        </div>
      )}

      {erro ? (
        <p className="osWarn" role="alert">
          {erro}
        </p>
      ) : null}

      <div className="focusActs">
        {confirmar ? (
          <>
            <button className="osGo" type="button" disabled={pending} onClick={enviar}>
              {pending ? <Spinner label="Enviando" /> : null}
              Sim, enviar
            </button>
            <button className="osPageBtn" type="button" disabled={pending} onClick={() => setConfirmar(false)}>
              Afinal não
            </button>
          </>
        ) : (
          <>
            {/* Sai para fora: pede sempre um segundo sim. É a única confirmação
                da manhã, e existe por isso mesmo. */}
            <button className="osGo" type="button" disabled={pending || !texto.trim()} onClick={() => setConfirmar(true)}>
              Enviar
            </button>
            <button className="osPageBtn" type="button" disabled={pending} onClick={() => setAEditar((v) => !v)}>
              {aEditar ? 'Pronto' : 'Editar'}
            </button>
            <button className="focusSkip" type="button" disabled={pending} onClick={depois}>
              Depois
            </button>
          </>
        )}
      </div>
    </>
  );
}

/** Conteúdo: o plano por cima, e as saídas — gravar, salvar, outra, fora.
 *
 *  «Hoje não» adia; «Não é para mim» recusa, e a recusa leva sempre o motivo.
 *  São coisas diferentes e estavam no mesmo botão: adiar uma ideia que ela
 *  detesta faz o plano de amanhã sugeri-la outra vez. */
function ContentStep({
  decision,
  onResolved,
  onSkip,
}: {
  decision: Decision;
  onResolved: () => void;
  onSkip: () => void;
}) {
  const p = decision.payload as Payload | undefined;
  const ideaId = str(p, 'ideaId');
  const [pending, start] = useTransition();
  const [aPerguntar, setAPerguntar] = useState<'outra' | 'fora' | null>(null);
  const [erro, setErro] = useState('');

  const gravar = str(p, 'recordMinutes') || num(p, 'recordMinutes');
  const editar = num(p, 'editMinutes');

  const decidir = (status: string, frase: string) =>
    start(async () => {
      const r = await decideOnIdea(ideaId, status).catch(() => ({ error: 'Não consegui salvar agora.' }));
      if (r.error) {
        setErro(r.error);
        return;
      }
      pushUndo(frase, async () => {
        await decideOnIdea(ideaId, 'ready');
      });
      onResolved();
    });

  const trocar = (motivo: RejectionReason) =>
    start(async () => {
      setErro('');
      const r = await anotherIdea(ideaId, motivo).catch(() => ({ error: 'Não consegui escrever outra agora.' }));
      if (r.error) {
        setErro(r.error);
        return;
      }
      // A ideia nova entra na fila de amanhã; esta sai de hoje.
      onSkip();
    });

  /** Recusar não é adiar: a ideia sai da manhã com o motivo escrito, e é o
   *  motivo que impede a mesma coisa de voltar amanhã. */
  const recusar = (motivo: RejectionReason) =>
    start(async () => {
      setErro('');
      const r = await decideOnIdea(ideaId, 'discarded', motivo).catch(() => ({
        error: 'Não consegui salvar agora.',
      }));
      if (r.error) {
        setErro(r.error);
        return;
      }
      pushUndo(`Fora: ${REJECTION_REASONS[motivo].toLowerCase()}.`, async () => {
        await decideOnIdea(ideaId, 'ready');
      });
      onResolved();
    });

  return (
    <>
      <p className="mornHook">«{str(p, 'hook')}»</p>
      <p className="mornMeta">
        {str(p, 'pillarLabel')}
        {typeof gravar === 'number' ? ` · ${gravar} min para gravar` : ''}
        {typeof editar === 'number' ? ` · ${editar} min para editar` : ''}
      </p>
      {str(p, 'verdict') ? <p className="mornVerdict">{str(p, 'verdict')}</p> : null}

      {erro ? (
        <p className="osWarn" role="alert">
          {erro}
        </p>
      ) : null}

      {aPerguntar ? (
        <div className="mornNudges">
          <span className="mornNudgeLabel">
            {aPerguntar === 'outra' ? 'O que estava errado nesta?' : 'Por quê?'}
          </span>
          {MOTIVOS.map(([chave, rotulo]) => (
            <button
              key={chave}
              type="button"
              disabled={pending}
              onClick={() => (aPerguntar === 'outra' ? trocar(chave) : recusar(chave))}
            >
              {pending ? <Spinner label="Escrevendo" /> : null}
              {rotulo}
            </button>
          ))}
        </div>
      ) : null}

      <div className="focusActs">
        <Link className="osGo" href={decision.href ?? '/dashboard/content'}>
          Ver o plano
        </Link>
        <button
          className="osPageBtn"
          type="button"
          disabled={pending}
          onClick={() => decidir('saved', `«${decision.headline}» ficou salva.`)}
        >
          salvar para depois
        </button>
        <button
          className="osPageBtn"
          type="button"
          disabled={pending}
          onClick={() => setAPerguntar((v) => (v === 'outra' ? null : 'outra'))}
        >
          Quero outra
        </button>
        <button
          className="focusSkip"
          type="button"
          disabled={pending}
          onClick={() => setAPerguntar((v) => (v === 'fora' ? null : 'fora'))}
        >
          Não é para mim
        </button>
        <button className="focusSkip" type="button" disabled={pending} onClick={onSkip}>
          Hoje não
        </button>
      </div>
    </>
  );
}

/** Dinheiro, prospeção e gravação: a ação vive noutra tela, mas o cartão diz
 *  tudo o que é preciso saber antes de lá ir. */
function LinkStep({ decision, onSkip }: { decision: Decision; onSkip: () => void }) {
  const cta =
    decision.kind === 'outreach_batch'
      ? decision.covers === 1
        ? 'Rever o email'
        : `Rever os ${decision.covers}`
      : decision.kind === 'recording'
        ? 'Começar a gravar'
        : 'Tratar disto';

  return (
    <div className="focusActs">
      <Link className="osGo" href={decision.href ?? '/dashboard'}>
        {cta}
      </Link>
      <button className="focusSkip" type="button" onClick={onSkip}>
        Depois
      </button>
    </div>
  );
}
