import type { ActionRow } from '@/modules/actions/service';
import Today from '@/components/dashboard/os/Today';
import Performance, { type LearningView, type PieceView } from '@/components/dashboard/os/content-brain/Performance';
import RecordPane from '@/components/dashboard/os/content-brain/RecordPane';
import StoryBank from '@/components/dashboard/os/content-brain/StoryBank';
import { type WeeklyFocusData } from '@/components/dashboard/os/content-brain/WeeklyFocus';
import { dailyBrief } from '@/modules/actions/brief';
import { EMPTY_PREPARED, describePrepared, orderDecisions } from '@/modules/morning/domain';
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
  { shot: 'Limpando, em movimento contínuo', note: '8-10s sem cortes.', required: true },
  { shot: 'Antes e depois, lado a lado', required: true },
  { shot: 'Reação à cara', note: 'Sem falar. Só a expressão.', required: true },
  { shot: 'Plano do detalhe do vidro', required: false },
  { shot: 'Vista da sala com a janela limpa', required: false },
];

/** A manhã preparada, como sai da consolidação. Serve a bancada de capturas:
 *  o Morning Brief só existe depois de os trabalhos correrem, e não se espera
 *  por uma madrugada para ver se a tela está bem. */
const MANHA = {
  date: '2026-09-02',
  status: 'partial' as const,
  headline: '4 coisas precisam de você — cerca de 6 minutos.',
  decisionCount: 4,
  estimatedMinutes: 6,
  openedAt: null,
  completedAt: null,
  prepared: {
    ...EMPTY_PREPARED,
    brandsFound: 8,
    referencesFound: 21,
    threadsOrganized: 9,
    repliesPrepared: 3,
    trendsFound: 12,
    contentIdeas: 2,
    mailboxesSynced: 2,
    followUpsCancelled: 1,
  },
  preparedLines: describePrepared({
    ...EMPTY_PREPARED,
    brandsFound: 8,
    referencesFound: 21,
    threadsOrganized: 9,
    repliesPrepared: 3,
    trendsFound: 12,
    contentIdeas: 2,
    mailboxesSynced: 2,
    followUpsCancelled: 1,
  }),
  gaps: [{ area: 'trends', message: 'Não consegui ver o TikTok Creative Center esta manhã.' }],
  decisions: orderDecisions([
    {
      id: 'reply:1',
      kind: 'reply',
      subject: 'Cecotec',
      headline: 'A Julia aprovou o briefing e o produto está a caminho.',
      because: 'Não pediu nada — só confirmou. Agradecer e dizer quando grava.',
      covers: 1,
      weightCents: null,
      urgent: false,
      waitingDays: 2,
      minutes: 1,
      href: '/dashboard/inbox',
      payload: {
        threadId: '00000000-0000-4000-8000-000000000001',
        draftSubject: 'Re: Colaboração UGC — briefing aprovado',
        draftBody:
          'Olá, Julia,\n\nótimo saber que o briefing está aprovado. Fico à espera do produto e aviso assim que chegar, com a data de gravação.\n\nAté já,\nCarol',
        replyTo: 'julia@cecotec.pt',
        whatChanged: 'Aprovaram o briefing e enviaram o produto.',
        whatIsMissing: '',
        risk: '',
        riskLevel: 'none',
        intentLabel: 'aprovou',
      },
    },
    {
      id: 'rights:1',
      kind: 'money',
      subject: 'Charabanc',
      headline: 'A licença acaba daqui a 11 dias.',
      because: 'Uma licença que expira em silêncio é receita que se perde sem ninguém dar por ela.',
      covers: 1,
      weightCents: null,
      urgent: false,
      waitingDays: null,
      minutes: 1,
      href: '/dashboard/revenue',
    },
    {
      id: 'outreach:batch',
      kind: 'outreach_batch',
      subject: 'Marcas novas',
      headline: 'Tenho 6 emails de prospeção prontos.',
      because: '4 destas marcas já têm referências e um conceito separado.',
      covers: 6,
      weightCents: null,
      urgent: false,
      waitingDays: null,
      minutes: 3,
      href: '/dashboard/outreach',
    },
    {
      id: 'content:1',
      kind: 'content',
      subject: 'Instagram',
      headline: 'Um UGC bonito pode ser um anúncio mau.',
      because: 'Já há material visual para mostrar a comparação lado a lado.',
      covers: 1,
      weightCents: null,
      urgent: false,
      waitingDays: null,
      minutes: 2,
      href: '/dashboard/content',
      payload: {
        ideaId: '00000000-0000-4000-8000-000000000002',
        platform: 'instagram',
        hook: 'O maior erro que cometi quando comecei em UGC foi tentar deixar tudo bonito.',
        recordMinutes: 12,
        editMinutes: 25,
        verdict: 'Eu gravaria este hoje.',
        pillarLabel: 'Estratégia criativa',
      },
    },
  ]),
};

/* ── Content Brain ────────────────────────────────────────────────────────── */

/** Uma história com a forma real: fatos que aconteceram, o ponto escolhido por
 *  ela, e os momentos que apontam para os fatos. Nada disto é inventado pelo
 *  harness — é o desenho do que o Story Workshop produz. */
const HISTORIA = {
  id: '00000000-0000-4000-8000-000000000001',
  title: 'O cenário que eu compliquei',
  summary: 'Passou duas horas mudando o cenário e no fim o primeiro take estava melhor.',
  facts: [
    'Passou quase duas horas mudando o cenário de um vídeo.',
    'Achou que o problema era o fundo e tirou tudo da mesa.',
    'Comparou com o primeiro take e o primeiro estava melhor.',
  ],
  meaning: 'Eu complico tentando melhorar demais.',
  frameLabel: 'Eu complico tentando melhorar demais.',
};

const FOCO_SEMANA: WeeklyFocusData = {
  pillar: 'attraction_journey',
  label: 'Atração',
  rationale: 'O foco desta semana é Atração. Você tem 3 situações reais disponíveis nesse pilar.',
  slots: [
    { kind: 'story', title: 'O cenário que eu compliquei', ready: true, purpose: 'primary' },
    { kind: 'story', title: 'A primeira marca que respondeu', ready: false, purpose: 'primary' },
    { kind: 'story', title: 'Gravar em inglês demorou o triplo', ready: false, purpose: 'complement' },
  ],
  gaps: [{ label: 'Prova e autoridade', available: 1 }],
  mappingOnly: false,
  hasPlan: true,
};

const FOCO_VAZIO: WeeklyFocusData = {
  ...FOCO_SEMANA,
  rationale: 'Ainda não tenho nenhuma situação real salva para Atração. Antes de plano, matéria-prima.',
  slots: [],
  gaps: [
    { label: 'Atração', available: 0 },
    { label: 'Informação e craft', available: 0 },
  ],
  mappingOnly: true,
  hasPlan: false,
};

const PECAS_PUBLICADAS: PieceView[] = [
  {
    mediaId: 'm1', permalink: 'https://instagram.com/reel/AAA', caption: 'O impossível às vezes é uma questão de tentar',
    publishedAt: dia(-3), productType: 'REELS', trialStatus: 'no', storyTitle: 'O cenário que eu compliquei',
    pillarLabel: 'Atração',
    readings: [
      { metric: 'reach', reading: 'Alcance: 1,6× a sua mediana', comparable: true },
      { metric: 'comments', reading: 'Comentários: 2,2× a sua mediana', comparable: true },
      { metric: 'avg_watch_time_seconds', reading: 'Retenção média: indisponível', comparable: false },
    ],
    snapshots: [
      { kind: 't1h', metrics: {} }, { kind: 't6h', metrics: {} }, { kind: 't24h', metrics: {} }, { kind: 't72h', metrics: {} },
    ],
    latestKind: 't72h',
  },
  {
    mediaId: 'm2', permalink: null, caption: 'Uma coisa não tem nada a ver com a outra',
    publishedAt: dia(-9), productType: 'REELS', trialStatus: 'unknown', storyTitle: null, pillarLabel: null,
    readings: [{ metric: 'views', reading: 'Views: 1.807 — só tenho 3 peças comparáveis. É pouco para dizer o que é normal.', comparable: false }],
    snapshots: [{ kind: 't24h', metrics: {} }],
    latestKind: 't24h',
  },
];

const APRENDIZADOS: LearningView[] = [
  { id: 'l1', statement: 'Há um sinal em conteúdos como «Eu complico tentando melhorar demais», falando (Comentários). Ainda não é um padrão.', ladderState: 'signal', confidence: 'low', sampleSize: 2 },
  { id: 'l2', statement: 'Conteúdos como «Uma coisa não tem nada a ver com a outra», humor parecem render mais em Comentários. Vale repetir esse caminho em outra história real.', ladderState: 'hypothesis', confidence: 'medium', sampleSize: 2 },
];

export default function Harness({ modo }: { modo?: string }) {
  if (modo === 'gravacao') {
    return (
      <div style={{ paddingTop: 40 }}>
        <h1>Modo de gravação</h1>
        <RecordingMode
          contentId="harness-1"
          title="O cenário que eu compliquei"
          shots={TOMADAS}
          story={{
            centralPoint: 'Eu complico tentando melhorar demais.',
            mustNotInvent: ['As duas horas aconteceram mesmo.', 'O primeiro take existe e é o que ficou.'],
            durationSeconds: 42,
          }}
        />
      </div>
    );
  }

  if (modo === 'conteudo' || modo === 'conteudo-vazio') {
    const vazio = modo === 'conteudo-vazio';
    return (
      <>
        <div className="dashBar">
          <h1>Conteúdo</h1>
          <span className="dashState">{vazio ? 'nada salvo ainda' : '1 pronta para gravar'}</span>
        </div>
        <RecordPane
          weekly={vazio ? FOCO_VAZIO : FOCO_SEMANA}
          focus="attraction_journey"
          ready={vazio ? [] : [{
            id: HISTORIA.id, title: HISTORIA.title, point: HISTORIA.meaning, beats: 4, durationSeconds: 42,
            shots: TOMADAS.map((t) => ({ shot: t.shot, note: t.note, required: true })),
            mustNotInvent: ['As duas horas aconteceram mesmo.'],
          }]}
          developing={vazio ? [] : [{
            id: '00000000-0000-4000-8000-000000000002', title: 'A primeira marca que respondeu',
            summary: 'Respondeu em dois dias e disse que a encontrou pelo Instagram.',
            needsConfirmation: true, nextStep: 'falta confirmar os fatos',
            facts: ['Uma marca respondeu dois dias depois.'], meaning: null, frameLabel: null,
          }]}
          candidates={vazio ? [] : [{
            id: '00000000-0000-4000-8000-000000000003',
            fact: 'A Cecotec respondeu e disse que te encontrou pelo Instagram.',
            question: 'Isso teve algum significado para você ou foi só mais um contato?',
            brandName: 'Cecotec', source: 'brand_reply',
          }]}
          trialToConfirm={vazio ? [] : [{
            mediaId: 'm2', caption: 'Uma coisa não tem nada a ver com a outra',
            publishedAt: dia(-9), permalink: null,
          }]}
          unlinkedMedia={[]}
          matchOptions={[]}
        />
      </>
    );
  }

  if (modo === 'desempenho') {
    return (
      <>
        <div className="dashBar">
          <h1>Conteúdo</h1>
          <span className="dashState">2 peças medidas</span>
        </div>
        <Performance pieces={PECAS_PUBLICADAS} learnings={APRENDIZADOS} lastSyncAt={dia(0)} />
      </>
    );
  }

  if (modo === 'banco') {
    return (
      <>
        <div className="dashBar">
          <h1>Conteúdo</h1>
          <span className="dashState">3 histórias salvas</span>
        </div>
        <StoryBank
          focus="attraction_journey"
          stories={[
            { id: HISTORIA.id, title: HISTORIA.title, summary: HISTORIA.summary, status: 'ready_to_record',
              statusLabel: 'Pronta para gravar', pillarLabel: 'Atração', sourceLabel: 'Você contou por áudio',
              privacyLabel: 'Pode virar conteúdo', isPrivate: false, needsConfirmation: false, used: false,
              seriesName: null, facts: HISTORIA.facts, meaning: HISTORIA.meaning, frameLabel: HISTORIA.frameLabel },
            { id: '00000000-0000-4000-8000-000000000002', title: 'A primeira marca que respondeu',
              summary: 'Respondeu em dois dias e disse que a encontrou pelo Instagram.', status: 'needs_confirmation',
              statusLabel: 'Falta confirmar', pillarLabel: null, sourceLabel: 'Detectado no email',
              privacyLabel: 'Pedir antes de usar', isPrivate: false, needsConfirmation: true, used: false,
              seriesName: null, facts: ['Uma marca respondeu dois dias depois.'], meaning: null, frameLabel: null },
            { id: '00000000-0000-4000-8000-000000000004', title: 'Discussão em casa na quinta',
              summary: 'Situação pessoal marcada como privada.', status: 'confirmed', statusLabel: 'Confirmada',
              pillarLabel: 'Conexão', sourceLabel: 'Você escreveu', privacyLabel: 'Privada',
              isPrivate: true, needsConfirmation: false, used: false, seriesName: null,
              facts: [], meaning: null, frameLabel: null },
          ]}
        />
      </>
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
        // `modo=fila` mostra o Hoje sem manhã preparada, e `modo=passos` tira
        // a resposta da frente: sem sessão nenhuma ação de servidor corre, e
        // essa é a única decisão do fluxo que precisa de uma para avançar.
        morning:
          modo === 'fila'
            ? null
            : modo === 'passos'
              ? { ...MANHA, decisions: MANHA.decisions.filter((d) => d.kind !== 'reply') }
              : MANHA,
        flags: { shadow_mode: true } as never,
        integration: { status: 'connected', lastSuccessAt: dia(0), account: 'carol@exemplo.pt' },
      }}
    />
  );
}
