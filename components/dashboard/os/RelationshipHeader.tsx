import Link from 'next/link';
import { actionsForOpportunity } from '@/modules/actions/service';
import { isActionable } from '@/modules/actions/next-action';
import { readThreadState, waitingLine } from '@/modules/email/thread-state';
import { intelForThread } from '@/modules/email/triage-service';
import { threadMessages, threadsForOpportunity } from '@/modules/inbox/queries';
import { STAGE_LABEL, type Stage } from '@/modules/opportunities/domain';
import { decodeEntities } from '@/lib/html';
import Conversation from './Conversation';
import NextActionCard from './NextActionCard';

/** O topo de uma marca ou de um negócio: três perguntas, pela ordem certa.
 *
 *    Situação agora        — de quem é a vez, e há quanto tempo.
 *    Próxima ação          — uma só, a mesma que o Hoje e a Inbox mostram.
 *    Trabalho já preparado — o email, quando existe, pronto a sair daqui.
 *
 *  E a conversa por baixo, à vista. Abria com quatro números e um formulário
 *  de etapa; a conversa — a única coisa que responde a «o que aconteceu?» —
 *  estava num painel dobrado a meio da página.
 *
 *  Server component: lê e passa. Quem envia é o cartão, que é de cliente. */
export default async function RelationshipHeader({
  opportunityId,
  brandName,
  stage,
  showConversation = true,
}: {
  opportunityId: string;
  brandName: string;
  stage: Stage;
  showConversation?: boolean;
}) {
  const [threads, actions] = await Promise.all([threadsForOpportunity(opportunityId), actionsForOpportunity(opportunityId)]);
  const thread = threads[0] ?? null;
  const [rows, intel] = await Promise.all([
    thread ? threadMessages(thread.id) : Promise.resolve([]),
    thread ? intelForThread(thread.id).catch(() => null) : Promise.resolve(null),
  ]);

  const messages = rows.map((m) => ({
    id: m.id,
    direction: m.direction as 'inbound' | 'outbound',
    sentAt: m.sent_at,
    fromAddress: m.from_address,
    fromName: m.from_name,
    subject: m.subject,
    body: decodeEntities(m.body_text ?? ''),
  }));
  const state = readThreadState(messages);
  const situacao = messages.length ? waitingLine(state, brandName) : 'Ainda não há conversa registada com esta marca.';

  const proxima = actions[0] ?? null;
  const acao = intel?.nextAction ?? proxima?.nextAction ?? null;
  const preparado = acao && isActionable(acao) && acao.preparedArtifact ? acao : null;
  const escolher = acao && acao.type === 'confirm_referral' ? acao : null;

  return (
    <>
      <section className="rel">
        <div className="relNow">
          <p className="relEyebrow">Situação agora</p>
          <p className="relLine">
            {situacao} <span className="osTag" data-tone={stage === 'won' ? 'won' : stage === 'lost' ? 'lost' : 'mute'}>{STAGE_LABEL[stage]}</span>
          </p>
        </div>

        <div className="relNext">
          <p className="relEyebrow">Próxima ação</p>
          {proxima ? (
            <>
              <h2>{proxima.title}</h2>
              <p className="osWhy">{proxima.reason}</p>
            </>
          ) : (
            <>
              <h2>Nada precisa de você aqui.</h2>
              <p className="osWhy">
                {state.waitingOn === 'brand' ? 'A vez é da marca. O follow-up marca-se sozinho.' : 'Quando alguma coisa mudar, aparece no Hoje.'}
              </p>
            </>
          )}
        </div>

        {thread && (preparado || escolher) ? (
          <div className="relWork">
            <p className="relEyebrow">Trabalho já preparado</p>
            <NextActionCard threadId={thread.id} action={(preparado ?? escolher)!} whoWrote={intel?.whoWrote} compact />
          </div>
        ) : null}
      </section>

      {showConversation && thread ? (
        <section className="osSection relConvo">
          <h2>Conversa</h2>
          <p className="osNote">
            {thread.subject || '(sem assunto)'}
            {threads.length > 1 ? ` · mais ${threads.length - 1} ${threads.length - 1 === 1 ? 'conversa' : 'conversas'} com esta marca` : ''}
            {' · '}
            <Link href={`/dashboard/inbox?thread=${thread.id}`}>Abrir a conversa completa</Link>
          </p>
          <Conversation messages={messages} brandName={brandName} compact />
          {threads.length > 1 ? (
            <div className="osRows relThreads">
              {threads.slice(1).map((t) => (
                <Link className="osRow" key={t.id} href={`/dashboard/inbox?thread=${t.id}`}>
                  <div>
                    <span className="osRowName" style={{ fontSize: 16 }}>{t.subject || '(sem assunto)'}</span>
                    <p className="osRowSub">{t.message_count} {t.message_count === 1 ? 'mensagem' : 'mensagens'}</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
