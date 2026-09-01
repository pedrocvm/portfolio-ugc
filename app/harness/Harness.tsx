import type { ActionRow } from '@/modules/actions/service';
import Today from '@/components/dashboard/os/Today';
import { dailyBrief } from '@/modules/actions/brief';
import { describeBackground } from '@/modules/actions/day';
import RecordingMode from '@/components/dashboard/os/RecordingMode';

/** Dados de exemplo com a forma do esquema real. Nomes de marca inventados de
 *  propósito: uma bancada não devia conter conversa verdadeira de ninguém. */
const dia = (n: number) => new Date(Date.now() + n * 86400000).toISOString();

const acao = (over: Partial<ActionRow> & Pick<ActionRow, 'id' | 'title'>): ActionRow => ({
  type: 'respond',
  reason: '',
  cta: 'Responder',
  dueAt: null,
  risk: 'none',
  priorityScore: 60,
  status: 'open',
  snoozedUntil: null,
  requiresApproval: true,
  evidence: {},
  opportunityId: '11111111-1111-4111-8111-111111111111',
  brandId: '22222222-2222-4222-8222-222222222222',
  brandName: 'Marca',
  stage: 'commercial_qualification',
  createdAt: dia(-2),
  ...over,
});

const ACOES: ActionRow[] = [
  acao({
    id: 'a1',
    brandName: 'Cecotec',
    title: 'Responder ao pedido de valor',
    reason: 'A marca pediu o seu valor e direitos para anúncios, e ainda não teve resposta.',
    cta: 'Enviar valor',
    type: 'send_rate',
    risk: 'medium',
    dueAt: dia(-3),
    priorityScore: 118,
  }),
  acao({
    id: 'a2',
    brandName: 'Vitalis Hotels',
    title: 'Pagamento em atraso',
    reason: 'Vencido há 5 dias. 250,00 EUR.',
    cta: 'Cobrar',
    type: 'chase_payment',
    risk: 'high',
    dueAt: dia(-5),
    priorityScore: 112,
  }),
  acao({
    id: 'a3',
    brandName: 'Padaria do Bairro',
    title: 'Enviar o follow-up',
    reason: 'Passaram nove dias desde a proposta e não houve resposta.',
    cta: 'Enviar follow-up',
    type: 'follow_up',
    dueAt: dia(0),
    priorityScore: 84,
  }),
  acao({
    id: 'a4',
    brandName: 'Nuvem SaaS',
    title: 'Preparar a oferta',
    reason: 'A oportunidade está qualificada mas ainda não tem valor nem escopo enviados.',
    cta: 'Criar proposta',
    type: 'create_proposal',
    priorityScore: 74,
  }),
  acao({
    id: 'a5',
    brandName: 'Quinta das Oliveiras',
    title: 'A espera combinada terminou',
    reason: 'Passou a data até à qual a oportunidade estava em espera.',
    cta: 'A espera terminou',
    type: 'wait_expired',
    requiresApproval: false,
    dueAt: dia(-1),
    priorityScore: 62,
  }),
  acao({
    id: 'a6',
    brandName: 'PetMaison',
    title: 'Sem próxima ação definida',
    reason: 'Nenhum evento recente e nenhum follow-up agendado.',
    cta: 'Rever',
    type: 'review',
    risk: 'low',
    requiresApproval: false,
    priorityScore: 41,
  }),
];

const CONTAS = { openOpportunities: 12, dueFollowUps: 3, needsReview: 2, overdue: 4 };

const TOMADAS = [
  { shot: 'Gancho: mostrar a janela suja', note: 'Plano fechado, 3-5s. Luz natural de lado.', required: true },
  { shot: 'Produto a sair da caixa', note: 'Mãos em primeiro plano.', required: true },
  { shot: 'A limpar, em movimento contínuo', note: '8-10s sem cortes.', required: true },
  { shot: 'Antes e depois, lado a lado', required: true },
  { shot: 'Reacção à cara', note: 'Sem falar. Só a expressão.', required: true },
  { shot: 'Plano do detalhe do vidro', required: false },
  { shot: 'Vista da sala com a janela limpa', required: false },
];

export default function Harness({ modo }: { modo?: string }) {
  if (modo === 'gravacao') {
    return (
      <div style={{ paddingTop: 40 }}>
        <h1>Modo de gravação</h1>
        <RecordingMode
          contentId="harness-1"
          title="Janela limpa em 30 segundos"
          shots={TOMADAS}
        />
      </div>
    );
  }

  return (
    <Today
      data={{
        actions: ACOES,
        greeting: 'Carol',
        counts: CONTAS,
        brief: dailyBrief({
          queued: ACOES.length,
          overdue: CONTAS.overdue,
          openOpportunities: CONTAS.openOpportunities,
          needsReview: CONTAS.needsReview,
          head: [
            { brandName: 'Cecotec', overdueDays: 3 },
            { brandName: 'Vitalis Hotels', overdueDays: 5 },
            { brandName: 'Padaria do Bairro', overdueDays: null },
          ],
          gmailConnected: true,
        }),
        background: describeBackground({
          waiting: [{ brandName: 'Quinta das Oliveiras', until: dia(6) }],
          scheduledFollowUps: [
            { brandName: 'Nuvem SaaS', dueAt: dia(2) },
            { brandName: 'Casa Verde', dueAt: dia(4) },
          ],
          snoozed: [{ brandName: 'PetMaison', title: 'Rever', until: dia(3) }],
          runningSearches: 1,
          pendingPayments: [
            { brandName: 'Estúdio Norte', amountCents: 48000, currency: 'EUR', dueAt: dia(12) },
          ],
        }),
        doneToday: 5,
        insights: [],
        flags: { shadow_mode: true } as never,
        integration: { status: 'connected', lastSuccessAt: dia(0), account: 'carol@exemplo.pt' },
      }}
    />
  );
}
