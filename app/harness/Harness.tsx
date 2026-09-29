import type { ActionRow } from '@/modules/actions/service';
import Today from '@/components/dashboard/os/Today';
import Performance, { type LearningView, type PieceView } from '@/components/dashboard/os/content-brain/Performance';
import RecordPane from '@/components/dashboard/os/content-brain/RecordPane';
import StoryWorkshop from '@/components/dashboard/os/content-brain/StoryWorkshop';
import StoryBank from '@/components/dashboard/os/content-brain/StoryBank';
import { type WeeklyFocusData } from '@/components/dashboard/os/content-brain/WeeklyFocus';
import { dailyBrief } from '@/modules/actions/brief';
import { EMPTY_PREPARED, describePrepared, orderDecisions } from '@/modules/morning/domain';
import { describeBackground } from '@/modules/actions/day';
import RecordingMode from '@/components/dashboard/os/RecordingMode';
import ContentGuide from '@/components/dashboard/os/content-brain/ContentGuide';
import Conversation from '@/components/dashboard/os/Conversation';
import Inbox from '@/components/dashboard/os/Inbox';
import NextActionCard from '@/components/dashboard/os/NextActionCard';
import { nextActionForThread, extractReferredContacts } from '@/modules/actions/next-action';
import ContentIntelligence from '@/components/dashboard/os/content-brain/ContentIntelligence';
import ContentStudio from '@/components/dashboard/os/ContentStudio';
import Editor from '@/components/dashboard/Editor';
import { DEFAULT_CONTENT } from '@/lib/content';
import Audit from '@/components/dashboard/os/content-brain/Audit';
import ContentVault from '@/components/dashboard/os/ContentVault';
import Notifications from '@/components/dashboard/Notifications';
import QuickCapture from '@/components/dashboard/QuickCapture';
import Assistant from '@/components/assistant/Assistant';
import type { FeedAuditView, StoryAuditView } from '@/modules/content-brain/performance-service';
import { auditPiece, feedSummary, type FeedPieceInput } from '@/modules/content-brain/feed-audit';
import { sequenceMetrics } from '@/modules/content-brain/stories';
import { accountSeries, buildAudit, compareAccountWindows, periodRange, type AccountDay } from '@/modules/content-brain/audit';
import type { AuditScreen } from '@/modules/content-brain/audit-service';
import WeekPane, { type Proposal, type WeekData } from '@/components/dashboard/os/content-brain/WeekPane';
import MapPane from '@/components/dashboard/os/content-brain/MapPane';
import ProductionPane from '@/components/dashboard/os/content-brain/ProductionPane';
import LabPane from '@/components/dashboard/os/content-brain/LabPane';
import Community from '@/components/dashboard/os/content-brain/Community';
import { COMMERCIAL_FOCUS, PILLAR, SOT_TOPICS } from '@/modules/content-brain/editorial';
import { PACK_DELIVERABLES, parsePack } from '@/modules/content-brain/pack';
import { aggregateIntents, INTENT_LABEL, type Intent } from '@/modules/content-brain/community';
import { RADAR_AUTOMATIC_BLOCKED } from '@/modules/content-brain/lab-service';

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
  nextAction: null,
  sourceThreadId: null,
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
  signals: ['O Reel de ontem passou 1,7× a sua mediana de comentários. Ainda é só um sinal; vou acompanhar.'],
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
      id: 'reply:cora',
      kind: 'reply',
      subject: 'Cora',
      headline: 'Estrella te encaminhou para a equipe de marketing.',
      because: 'Encontrei o contato que ela passou e deixei o próximo email pronto.',
      covers: 1,
      weightCents: null,
      urgent: false,
      waitingDays: 3,
      minutes: 1,
      href: '/dashboard/inbox?thread=00000000-0000-4000-8000-000000000002',
      payload: {
        threadId: '00000000-0000-4000-8000-000000000002',
        draftSubject: 'UGC | Ideia de criativo para a Cora',
        draftBody:
          'Olá, equipe de marketing!\n\nA Estrella, do atendimento da Cora, me indicou este contato para falar sobre uma colaboração de conteúdo UGC. Deixo abaixo o que já tinha compartilhado com vocês.\n\nPensei num ângulo que pode funcionar muito bem para os anúncios pagos de vocês: a frustração de perder tempo com bancos tradicionais e resolver isso em segundos pelo app da Cora.\n\nFico à disposição para conversar.\n\nCarolina',
        replyTo: 'marketing@cora.com.br',
        targetKind: 'compose',
        actionType: 'compose_to_new_contact',
        actionTitle: 'Escrever para marketing@cora.com.br',
        evidenceBecause: 'Esse endereço foi informado pela própria marca nesta mensagem.',
        evidenceQuote: 'Time de Marketing - marketing@cora.com.br',
        artifactSource: 'model',
        whatChanged: 'A marca disse que quem decide é o marketing e deixou o email.',
        whatIsMissing: '',
        risk: '',
        riskLevel: 'none',
        intentLabel: 'indicou outra pessoa',
      },
    },
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


/* ── Estratégia de conteúdo ───────────────────────────────────────────────── */

const proposta = (over: Partial<Proposal> & Pick<Proposal, 'id' | 'topicLabel' | 'angle'>): Proposal => ({
  pillarLabel: 'UGC como renda',
  lens: 'what_i_do', lensLabel: 'O que faço',
  objective: 'prove', objectiveLabel: 'Provar',
  format: 'reel', formatLabel: 'Reel',
  structureLabel: null, modalityLabel: null,
  whyNow: '', evidence: [],
  status: 'proposed', statusLabel: 'Proposto', statusMeans: 'Esperando sua validação.',
  packId: null, packGaps: [], reelTest: false,
  ...over,
});

const SEMANA: WeekData = {
  weekStart: '2026-09-28',
  capacity: 3,
  summary: '1 para atrair, 1 para reter e 1 para provar. Também temos um teste de formato nesta semana.',
  proposals: [
    proposta({
      id: 'p1',
      topicLabel: 'Experiências com marcas',
      angle: 'A marca cancelou dois dias antes da gravação.',
      whyNow: 'Aconteceu: a marca cancelou dois dias antes da gravação. Faltou provar nas últimas publicações. Serve ao foco comercial: SaaS e apps para negócios locais.',
      evidence: [
        { kind: 'recent_event', detail: 'Aconteceu: a marca cancelou dois dias antes da gravação.' },
        { kind: 'objective_under', detail: 'Faltou provar nas últimas publicações.' },
        { kind: 'commercial_value', detail: 'Serve ao foco comercial: SaaS e apps para negócios locais.' },
      ],
    }),
    proposta({
      id: 'p2',
      topicLabel: 'Sete bichos',
      angle: 'A rotina com a casa cheia, de um jeito que dê vontade de continuar acompanhando.',
      pillarLabel: 'Casa', lens: 'who_i_am', lensLabel: 'Quem sou',
      objective: 'retain', objectiveLabel: 'Reter',
      format: 'story', formatLabel: 'Stories',
      whyNow: 'Casa apareceu pouco nas últimas 6 publicações. «Quem sou» sumiu das últimas publicações. Você ainda não falou disso.',
      evidence: [
        { kind: 'pillar_absent', detail: 'Casa apareceu pouco nas últimas 6 publicações.' },
        { kind: 'lens_absent', detail: '«Quem sou» sumiu das últimas publicações.' },
        { kind: 'topic_rotation', detail: 'Você ainda não falou disso.' },
      ],
      status: 'approved_to_develop', statusLabel: 'Aprovado para desenvolver',
      statusMeans: 'Assunto, ângulo e formato aceitos.',
    }),
    proposta({
      id: 'p3',
      topicLabel: 'Braga a Fundo',
      angle: 'O olhar dela sobre o serviço, de um jeito que faça quem não te conhece reconhecer a situação.',
      pillarLabel: 'Experiências', lens: 'how_i_think', lensLabel: 'Como penso',
      objective: 'attract', objectiveLabel: 'Atrair',
      format: 'carousel', formatLabel: 'Carrossel',
      structureLabel: 'POV',
      whyNow: 'Experiências apareceu pouco nas últimas 6 publicações. Carrossel funciona para a Carol?',
      evidence: [
        { kind: 'pillar_absent', detail: 'Experiências apareceu pouco nas últimas 6 publicações.' },
        { kind: 'format_untested', detail: 'Carrossel funciona para a Carol?' },
      ],
      status: 'to_validate', statusLabel: 'Para validar',
      statusMeans: 'O material está pronto para você revisar.',
      packId: 'pk1',
    }),
  ],
  needsYou: [],
  readyToProduce: [],
  exists: true,
};
SEMANA.needsYou = SEMANA.proposals.filter((p) => p.status === 'proposed' || p.status === 'to_validate');

const MAPA = ['ugc_income', 'experiences', 'home'].map((slug) => {
  const pilar = slug as 'ugc_income' | 'experiences' | 'home';
  const assuntos = SOT_TOPICS.filter((t) => t.pillar === pilar);
  return {
    pillar: pilar,
    label: PILLAR[pilar].label,
    purpose: PILLAR[pilar].purpose,
    guardrails: PILLAR[pilar].guardrails,
    topics: assuntos.map((t, i) => ({
      id: `t-${t.slug}`, label: t.label, howToTreat: t.howToTreat, state: t.state,
      origin: 'sot', lastUsedAt: i === 0 ? dia(-31) : null, useCount: i === 0 ? 2 : 0,
    })),
    liveCount: assuntos.filter((t) => t.state === 'now').length,
  };
});

const PACK_CARROSSEL = parsePack('carousel', {
  cover: 'Fui a um sítio que toda a gente recomenda. Saí a pensar noutra coisa.',
  slides: [
    { index: 0, copy: 'A reserva foi a parte mais fácil do dia.', composition: 'Capa com título grande, foto de fundo.' },
    { index: 1, copy: 'Chegámos às 20h. Ninguém nos olhou durante quatro minutos.', composition: 'Foto cheia, texto em baixo.' },
    { index: 2, copy: 'A comida estava boa. O que ficou não foi a comida.', composition: 'Duas fotos, corte ao meio.' },
    { index: 3, copy: 'Serviço é a parte que ninguém fotografa.', composition: 'Só texto, respiro à volta.' },
  ],
  templateKey: null,
  typography: 'Título na fonte de display, corpo na de texto.',
  palette: 'A paleta aprovada; o tom de destaque ainda está por decidir.',
  assets: [
    { kind: 'photo', what: 'A foto da sala vazia', ready: true },
    { kind: 'photo', what: 'O prato, sem filtro', ready: false },
  ],
  caption: '',
});

const COMUNIDADE = aggregateIntents(
  ([
    ...Array.from({ length: 9 }, () => 'identification'),
    ...Array.from({ length: 5 }, () => 'own_experience'),
    ...Array.from({ length: 4 }, () => 'question'),
    ...Array.from({ length: 3 }, () => 'curiosity'),
    ...Array.from({ length: 7 }, () => 'generic_praise'),
    'brand',
  ] as const).map((intent, i) => ({ id: `c${i}`, intent: intent as Intent, confidence: 'medium' as const })),
);

const LAB_FORMATOS = [
  { dimension: 'format', dimensionLabel: 'Formato', value: 'reel', valueLabel: 'Reel',
    state: 'early_signal', stateLabel: 'Sinal inicial', phrasing: 'Começou a mostrar sinal.',
    because: '11 peças, mas sem alternativa comparável. Uso não é vantagem.', sampleSize: 11, comparedWith: 0 },
  { dimension: 'format', dimensionLabel: 'Formato', value: 'carousel', valueLabel: 'Carrossel',
    state: 'untested', stateLabel: 'Não testado', phrasing: 'Você ainda não experimentou isso.',
    because: 'Nenhuma peça usou isso ainda.', sampleSize: 0, comparedWith: 11 },
  { dimension: 'format', dimensionLabel: 'Formato', value: 'photo_sequence', valueLabel: 'Sequência de fotos',
    state: 'untested', stateLabel: 'Não testado', phrasing: 'Você ainda não experimentou isso.',
    because: 'Nenhuma peça usou isso ainda.', sampleSize: 0, comparedWith: 11 },
  { dimension: 'format', dimensionLabel: 'Formato', value: 'story', valueLabel: 'Stories',
    state: 'testing', stateLabel: 'Em teste', phrasing: 'Está em teste. Ainda é cedo.',
    because: 'Uma peça só. Ainda não dá para ler nada.', sampleSize: 1, comparedWith: 11 },
];

/** A fixture da Auditoria, à parte para as duas bancadas a poderem usar: a
 *  tela sozinha (`modo=auditoria`) e o Conteúdo inteiro com as abas
 *  (`modo=estudio`). Determinística — a mesma bancada duas vezes dá a mesma
 *  tela, senão não se aprova nada olhando para ela. */
function auditoriaFixture(vaziaAud: boolean): AuditScreen {
    // Fixtures determinísticas, nunca aleatórias: a mesma bancada duas vezes
    // tem de dar a mesma tela, senão não se aprova nada olhando para ela.
    const range = periodRange('30d', { now: new Date('2026-09-21T12:00:00Z') });

    const diaConta = (d: number, seguidores: number | null, alcance: number | null): AccountDay => ({
      observedOn: new Date(Date.parse('2026-09-21T00:00:00Z') + d * 86400000).toISOString().slice(0, 10),
      followersCount: seguidores, reach: alcance, views: alcance === null ? null : alcance * 3,
      accountsEngaged: alcance === null ? null : Math.round(alcance * 0.18),
      totalInteractions: alcance === null ? null : Math.round(alcance * 0.24),
      profileLinkTaps: null,
    });
    // Um dia sem medição no meio: a linha abre um buraco em vez de interpolar.
    const atuais = accountSeries([
      diaConta(-29, 860, 1400), diaConta(-25, 868, 1520), diaConta(-21, 874, 1610),
      diaConta(-17, 879, null), diaConta(-13, 886, 1880), diaConta(-9, 890, 2010),
      diaConta(-5, 894, 2140), diaConta(-1, 897, 2260),
    ]);
    const anteriores = accountSeries([
      diaConta(-59, 812, 980), diaConta(-55, 820, 1010), diaConta(-51, 828, 1120),
      diaConta(-47, 834, 1180), diaConta(-43, 841, 1240), diaConta(-39, 848, 1300),
      diaConta(-35, 853, 1350), diaConta(-31, 858, 1390),
    ]);

    const resultado = buildAudit({
      range,
      account: vaziaAud ? { current: [], previous: [] } : { current: atuais, previous: anteriores },
      feed: vaziaAud
        ? { points: [], comparable: 0, total: 0 }
        : {
            comparable: 11, total: 18,
            points: [
              // Reel de alcance mediano e compartilhamento alto.
              { text: 'Peças «demonstração» estão gerando compartilhamentos acima da sua mediana (2,1× no meio do grupo).', sample: '4 peças', confidence: 'medium', evidence: ['m1', 'm2', 'm3', 'm4'] },
              // Reel de ótimo alcance e baixo compartilhamento.
              { text: 'Peças «estético» ficam abaixo da sua mediana em salvamentos (0,6× no meio do grupo). Não é veredito; é o que os números dizem por agora.', sample: '3 peças', confidence: 'low', evidence: ['m5', 'm6', 'm7'] },
              // Uma peça só: tem de cair em «merece atenção», nunca em «aprendemos».
              { text: 'A peça mais forte, relativa a você, é «O cenário que eu compliquei»: comentários 3,4× a sua mediana. Vale repetir o mecanismo, não o vídeo.', sample: 'entre 11 peças comparáveis', confidence: 'low', evidence: ['m1'] },
            ],
          },
      stories: vaziaAud
        ? { points: [], measuredSequences: 0 }
        : {
            measuredSequences: 7,
            points: [{ text: 'Nas últimas 4 semanas, sequências curtas (até 3) mantiveram mais gente até ao fim do que as longas (5 ou mais): 78% contra 54% do alcance inicial.', sample: 'Amostra: 4 vs 3 sequências.', confidence: 'low', sequenceIds: ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7'] }],
          },
      learnings: vaziaAud
        ? []
        : [
            { id: 'l1', statement: 'Conteúdos como «eu complico tentando melhorar demais», falando ficaram acima da sua mediana em comentários e salvamentos, em 4 peças. Dá para contar com isso.', ladderState: 'validated', sampleSize: 4, confidence: 'high', evidenceIds: ['m1', 'm2', 'm8', 'm9'], derivedAt: dia(-1) },
            { id: 'l2', statement: 'Conteúdos como «montagem estética» parecem render mais em alcance. Vale repetir esse caminho em outra história real.', ladderState: 'hypothesis', sampleSize: 3, confidence: 'medium', evidenceIds: ['m5', 'm6', 'm7'], derivedAt: dia(-2) },
            { id: 'l3', statement: 'Conteúdos como «resultado primeiro», estético não se sustentaram.', ladderState: 'rejected', sampleSize: 3, confidence: 'medium', evidenceIds: ['m10', 'm11', 'm12'], derivedAt: dia(-3), contradictedAt: dia(-3) },
            { id: 'l4', statement: 'Há um sinal em conteúdos como «bastidores».', ladderState: 'signal', sampleSize: 1, confidence: 'low', evidenceIds: ['m13'], derivedAt: dia(-1) },
          ],
      experiments: vaziaAud
        ? []
        : [
            { id: 'e1', label: 'Abertura curta contra introdução contextual', outcome: 'consistent', because: 'Mudando introdução contextual para demonstração imediata, retenção média ficou 44% acima na leitura de t24h (mediana 5,1 contra 7,3), sobre 3 contra 3 peças. compartilhamentos vão no mesmo sentido. É evidência consistente o suficiente para orientar o próximo teste.', sampleSize: 6, primaryMetric: 'avg_watch_time_seconds', mediaIds: ['m1', 'm2', 'm3', 'm14', 'm15', 'm16'] },
            { id: 'e2', label: 'Legenda longa contra legenda curta', outcome: 'inconclusive', because: 'A diferença em salvamentos ficou em 7% — dentro do que varia sozinho entre peças. Com 2 contra 2 peças, não chamo isso de resultado.', sampleSize: 4, primaryMetric: 'saves', mediaIds: ['m17', 'm18'] },
          ],
      now: new Date('2026-09-21T12:00:00Z'),
    });

    const tela: AuditScreen = {
      health: vaziaAud
        ? { state: 'healthy', line: 'atualizado agora', username: 'carolxqueiroz', lastSuccessAt: dia(0), followersCount: null, mediaCount: null }
        : { state: 'healthy', line: 'atualizado há 18 min', username: 'carolxqueiroz', lastSuccessAt: dia(0), followersCount: 897, mediaCount: 24 },
      period: '30d',
      range,
      run: {
        id: 'run1', conclusions: resultado.conclusions, coverage: resultado.coverage,
        generatedAt: dia(0), mediaConsidered: vaziaAud ? 0 : 18, comparableMedia: vaziaAud ? 0 : 11,
        engineVersion: resultado.engineVersion,
      },
      nextTest: vaziaAud || !resultado.nextTest ? null : {
        id: 'r1', dedupeKey: resultado.nextTest.dedupeKey, kind: resultado.nextTest.kind,
        statement: resultado.nextTest.statement, because: resultado.nextTest.because,
        status: 'open', closedBecause: null, sampleSize: resultado.nextTest.sampleSize,
        confidence: resultado.nextTest.confidence, evidence: resultado.nextTest.evidence,
        testDraft: resultado.nextTest.testDraft, experimentId: null, feedback: null, createdAt: dia(0),
      },
      recommendations: vaziaAud ? [] : resultado.recommendations.slice(0, 4).map((r, i) => ({
        id: `r${i + 1}`, dedupeKey: r.dedupeKey, kind: r.kind, statement: r.statement, because: r.because,
        status: 'open' as const, closedBecause: null, sampleSize: r.sampleSize, confidence: r.confidence,
        evidence: r.evidence, testDraft: r.testDraft, experimentId: null, feedback: null, createdAt: dia(0),
      })),
      experiments: vaziaAud ? [] : [
        { id: 'e1', kind: 'exp:abertura', label: 'Abertura curta contra introdução contextual', hypothesis: 'Abrir direto na demonstração reduz abandono inicial.', whatWeTest: 'os primeiros segundos', variable: 'os primeiros segundos', controlLabel: 'introdução contextual', variantLabel: 'demonstração imediata', primaryMetric: 'avg_watch_time_seconds', secondaryMetrics: ['shares', 'reach'], higherIsBetter: true, status: 'measured', origin: 'recommendation', controlMediaIds: ['m1', 'm2', 'm3'], variantMediaIds: ['m14', 'm15', 'm16'], sampleSize: 6, outcome: 'consistent', outcomeLabel: 'Evidência consistente', because: 'Retenção média 44% acima na leitura de t24h, sobre 3 contra 3 peças.', result: null, learning: null, startedAt: dia(-21), endedAt: null, evaluatedAt: dia(0), recommendationId: null },
        { id: 'e2', kind: 'exp:legenda', label: 'Legenda longa contra legenda curta', hypothesis: 'Uma legenda curta faz mais gente salvar.', whatWeTest: 'o tamanho da legenda', variable: 'o tamanho da legenda', controlLabel: 'legenda longa', variantLabel: 'legenda curta', primaryMetric: 'saves', secondaryMetrics: [], higherIsBetter: true, status: 'running', origin: 'carol', controlMediaIds: ['m17'], variantMediaIds: ['m18'], sampleSize: 2, outcome: 'inconclusive', outcomeLabel: 'Inconclusivo', because: 'A diferença ficou em 7% — dentro do que varia sozinho entre peças.', result: null, learning: null, startedAt: dia(-7), endedAt: null, evaluatedAt: dia(0), recommendationId: null },
      ],
      evolution: vaziaAud ? { current: [], previous: [] } : { current: atuais, previous: anteriores },
      movements: vaziaAud ? compareAccountWindows([], []) : compareAccountWindows(atuais, anteriores),
    };

  return tela;
}

export default function Harness({ modo }: { modo?: string }) {

  // O Conteúdo inteiro, com as cinco abas reais — é assim que a Carol o vê.
  // As bancadas de cada aba continuam a existir para aprovar uma tela sozinha;
  // esta existe para a navegação, que é a primeira coisa que ela tem de
  // aprender: cinco perguntas, uma por aba.
  if (modo === 'estudio') {
    const packCarrossel = PACK_CARROSSEL.ok
      ? {
          id: 'pk1', proposalId: 'p3', kindLabel: 'Carrossel',
          deliverables: PACK_DELIVERABLES.carousel, payload: PACK_CARROSSEL.pack,
          gaps: ['falta escolher o template'], status: 'to_validate', templateKey: null,
        }
      : null;
    return (
      <>
        <div className="dashBar">
          <h1>Conteúdo</h1>
          <span className="dashState">2 decisões suas</span>
        </div>
        <ContentStudio
          initial="week"
          panes={{
            week: (
              <WeekPane
                week={SEMANA}
                learnings={[{
                  id: 'l1',
                  statement: 'Terminar com uma pergunta trouxe mais histórias pessoais.',
                  level: 'Sinal',
                  because: '2 peças coerentes em salvamentos. Vale repetir em outra história real.',
                }]}
                stock={{ ready: 2, target: 3 }}
              />
            ),
            map: (
              <MapPane
                pillars={MAPA}
                focus={{
                  label: 'Construção de carreira em Tech UGC e Canvas UGC',
                  items: ['tech_ugc', 'canvas_ugc', 'saas_local_business', 'community'],
                  itemLabels: ['Tech UGC', 'Canvas UGC', 'SaaS e apps para negócios locais', 'Criação de comunidade'],
                  since: dia(-12),
                }}
                capacity={3}
                commercialFocus={COMMERCIAL_FOCUS}
              />
            ),
            production: (
              <ProductionPane
                toValidate={[{
                  proposalId: 'p3', title: 'Braga a Fundo',
                  angle: 'O olhar dela sobre o serviço.', status: 'to_validate',
                  statusLabel: 'Para validar', formatLabel: 'Carrossel', pack: packCarrossel,
                }]}
                ready={[{
                  proposalId: 'p2', title: 'Sete bichos',
                  angle: 'A rotina com a casa cheia.', status: 'ready_to_produce',
                  statusLabel: 'Pronto para produzir', formatLabel: 'Stories', pack: null,
                }]}
                inProduction={[]}
                groups={[{
                  key: 'casa:sem_tela:to_camera',
                  label: 'Uma montagem só: 2 peças',
                  shared: ['em casa', 'falando para a câmera', 'Casa'],
                  needsOuting: false,
                  checklist: [
                    'Antes de começar: o print do painel',
                    '1. Sete bichos',
                    '2. Tecnologia doméstica',
                    'B-roll partilhado: grave uma vez e reaproveite',
                  ],
                  items: [{ proposalId: 'p2', title: 'Sete bichos' }, { proposalId: 'p4', title: 'Tecnologia doméstica' }],
                }]}
                savedSessions={[]}
                templates={[
                  { key: 'carousel_editorial', label: 'Carrossel editorial', pendingTokens: ['cor primária', 'tipografia de título'] },
                  { key: 'carousel_practical', label: 'Carrossel prático', pendingTokens: ['cor primária'] },
                ]}
                stock={{ ready: 2, target: 3 }}
              />
            ),
            lab: (
              <LabPane
                formats={LAB_FORMATOS}
                others={[
                  { dimension: 'opening', dimensionLabel: 'Abertura', value: 'question', valueLabel: 'pergunta',
                    state: 'early_signal', stateLabel: 'Sinal inicial', phrasing: 'Começou a mostrar sinal.',
                    because: '2 peças comparadas. É cedo para padrão.', sampleSize: 2, comparedWith: 9 },
                ]}
                experiments={[{
                  id: 'e1', label: 'Braga a Fundo — formato',
                  question: 'Carrossel funciona para a Carol?', variable: 'formato',
                  constants: ['assunto', 'objetivo', 'duração aproximada'],
                  status: 'running', outcome: 'pending', outcomeLabel: 'Ainda sem leitura',
                  because: '', sampleSize: 0, reelTest: false,
                }]}
                references={[{
                  id: 'r1', url: 'https://www.instagram.com/reel/ABC123/', platform: 'instagram',
                  handle: 'umacreator', status: 'done',
                  structure: 'Três batidas curtas, corte seco, a terceira quebra a expectativa.',
                  question: 'Corte seco a cada 2s funciona quando é a Carol a falar?',
                  durationSeconds: 14, sceneCount: 3, effort: 'low', unknown: ['texto em tela'], fromRadar: false,
                }]}
                radar={[{ id: 'rc1', handle: 'umacreator', platform: 'instagram', why: 'Formatos curtos para marcas tech.' }]}
                radarBlocked={RADAR_AUTOMATIC_BLOCKED}
              />
            ),
            audit: (
              <Audit
                screen={auditoriaFixture(false)}
                explore={<p className="osNote">(o detalhe peça a peça vive na cena «inteligencia»)</p>}
              />
            ),
          }}
        />
      </>
    );
  }

  // O editor do site, com o conteúdo por omissão. Nada aqui grava: sem sessão
  // nenhuma ação de servidor corre, e é isso que torna a bancada segura.
  if (modo === 'site') {
    return <Editor initial={DEFAULT_CONTENT} />;
  }

  if (modo === 'semana' || modo === 'semana-vazia') {
    const vazia = modo === 'semana-vazia';
    return (
      <>
        <div className="dashBar">
          <h1>Conteúdo</h1>
          <span className="dashState">{vazia ? 'semana em aberto' : '2 decisões suas'}</span>
        </div>
        <WeekPane
          week={vazia ? { ...SEMANA, proposals: [], needsYou: [], readyToProduce: [], exists: false } : SEMANA}
          learnings={vazia ? [] : [{
            id: 'l1',
            statement: 'Terminar com uma pergunta trouxe mais histórias pessoais.',
            level: 'Sinal',
            because: '2 peças coerentes em salvamentos. Vale repetir em outra história real.',
          }]}
          stock={{ ready: vazia ? 0 : 2, target: 3 }}
        />
      </>
    );
  }

  if (modo === 'mapa') {
    return (
      <>
        <div className="dashBar"><h1>Conteúdo</h1><span className="dashState">Mapa</span></div>
        <MapPane
          pillars={MAPA}
          focus={{
            label: 'Construção de carreira em Tech UGC e Canvas UGC',
            items: ['tech_ugc', 'canvas_ugc', 'saas_local_business', 'community'],
            itemLabels: ['Tech UGC', 'Canvas UGC', 'SaaS e apps para negócios locais', 'Criação de comunidade'],
            since: dia(-12),
          }}
          capacity={3}
          commercialFocus={COMMERCIAL_FOCUS}
        />
      </>
    );
  }

  if (modo === 'producao') {
    const pack = PACK_CARROSSEL.ok
      ? {
          id: 'pk1', proposalId: 'p3', kindLabel: 'Carrossel',
          deliverables: PACK_DELIVERABLES.carousel, payload: PACK_CARROSSEL.pack,
          gaps: ['falta escolher o template'], status: 'to_validate', templateKey: null,
        }
      : null;
    return (
      <>
        <div className="dashBar"><h1>Conteúdo</h1><span className="dashState">Produção</span></div>
        <ProductionPane
          toValidate={[{
            proposalId: 'p3', title: 'Braga a Fundo',
            angle: 'O olhar dela sobre o serviço.', status: 'to_validate',
            statusLabel: 'Para validar', formatLabel: 'Carrossel', pack,
          }]}
          ready={[{
            proposalId: 'p2', title: 'Sete bichos',
            angle: 'A rotina com a casa cheia.', status: 'ready_to_produce',
            statusLabel: 'Pronto para produzir', formatLabel: 'Stories', pack: null,
          }]}
          inProduction={[]}
          groups={[{
            key: 'casa:sem_tela:to_camera',
            label: 'Uma montagem só: 2 peças',
            shared: ['em casa', 'falando para a câmera', 'Casa'],
            needsOuting: false,
            checklist: [
              'Antes de começar: o print do painel',
              '1. Sete bichos',
              '2. Tecnologia doméstica',
              'B-roll partilhado: grave uma vez e reaproveite',
            ],
            items: [{ proposalId: 'p2', title: 'Sete bichos' }, { proposalId: 'p4', title: 'Tecnologia doméstica' }],
          }]}
          savedSessions={[]}
          templates={[
            { key: 'carousel_editorial', label: 'Carrossel editorial', pendingTokens: ['cor primária', 'tipografia de título'] },
            { key: 'carousel_practical', label: 'Carrossel prático', pendingTokens: ['cor primária'] },
          ]}
          stock={{ ready: 2, target: 3 }}
        />
      </>
    );
  }

  if (modo === 'laboratorio') {
    return (
      <>
        <div className="dashBar"><h1>Conteúdo</h1><span className="dashState">Laboratório</span></div>
        <LabPane
          formats={LAB_FORMATOS}
          others={[
            { dimension: 'opening', dimensionLabel: 'Abertura', value: 'question', valueLabel: 'pergunta',
              state: 'early_signal', stateLabel: 'Sinal inicial', phrasing: 'Começou a mostrar sinal.',
              because: '2 peças comparadas. É cedo para padrão.', sampleSize: 2, comparedWith: 9 },
          ]}
          experiments={[{
            id: 'e1', label: 'Braga a Fundo — formato',
            question: 'Carrossel funciona para a Carol?', variable: 'formato',
            constants: ['assunto', 'objetivo', 'duração aproximada'],
            status: 'running', outcome: 'pending', outcomeLabel: 'Ainda sem leitura',
            because: '', sampleSize: 0, reelTest: false,
          }]}
          references={[{
            id: 'r1', url: 'https://www.instagram.com/reel/ABC123/', platform: 'instagram',
            handle: 'umacreator', status: 'done',
            structure: 'Três batidas curtas, corte seco, a terceira quebra a expectativa.',
            question: 'Corte seco a cada 2s funciona quando é a Carol a falar?',
            durationSeconds: 14, sceneCount: 3, effort: 'low', unknown: ['texto em tela'], fromRadar: false,
          }]}
          radar={[{ id: 'rc1', handle: 'umacreator', platform: 'instagram', why: 'Formatos curtos para marcas tech.' }]}
          radarBlocked={RADAR_AUTOMATIC_BLOCKED}
        />
      </>
    );
  }

  if (modo === 'comunidade') {
    return (
      <>
        <div className="dashBar"><h1>Conteúdo</h1><span className="dashState">Auditoria</span></div>
        <Community data={{ ...COMUNIDADE, mediaId: null, breakdown:
          (Object.entries(COMUNIDADE.counts) as [string, number][])
            .filter(([, n]) => n > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([intent, count]) => ({
              intent: intent as never,
              label: INTENT_LABEL[intent as Intent] ?? intent,
              count,
            })),
        }} />
      </>
    );
  }

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

  // `guia` abre o Content Brain com o convite da primeira visita à vista;
  // `guia-visto` mostra o mesmo cabeçalho depois de ela já ter respondido.
  if (modo === 'guia' || modo === 'guia-visto') {
    return (
      <>
        <div className="dashBar">
          <h1>Conteúdo</h1>
          <span className="dashState">1 pronta para gravar</span>
          <ContentGuide focus="attraction_journey" offerFirstRun={modo === 'guia'} resumeAt={0} />
        </div>
        <RecordPane
          weekly={FOCO_SEMANA}
          focus="attraction_journey"
          ready={[]}
          developing={[]}
          candidates={[]}
          trialToConfirm={[]}
          unlinkedMedia={[]}
          matchOptions={[]}
        />
      </>
    );
  }

  if (modo === 'lentes') {
    // O caminho real: é assim que o Hoje entra, com o workshop já aberto na
    // escolha de direção. As direções vêm da base pela server action.
    return (
      <>
        <div className="dashBar">
          <h1>Conteúdo</h1>
          <span className="dashState">procurando uma história</span>
        </div>
        <StoryWorkshop focus="attraction_journey" trigger="Encontrar uma história" autoOpen />
      </>
    );
  }

  // O cromo da área privada: a barra de ações, o sino, os botões flutuantes,
  // o cabeçalho de um cartão do site e os campos do banco de conteúdo — tudo
  // o que a auditoria de CSS mediu, na mesma tela, para medir aqui também.
  if (modo === 'chrome' || modo === 'chrome-stuck') {
    return (
      <>
        <i className="topMark" aria-hidden="true" />
        <div className="dashSticky" data-stuck={modo === 'chrome-stuck' || undefined}>
          <div className="dashBar">
            <h1>Conteúdo do site</h1>
            <span className="dashState" data-tone="ok">Publicado</span>
            <button type="button" className="btn quiet">Repor</button>
            <button type="button" className="btn">salvar</button>
            <button type="button" className="btn solid">Publicar</button>
          </div>
        </div>
        <Notifications
          items={[
            { id: 'n1', severity: 'urgent', title: 'A Cecotec está 3 dias atrasada', detail: 'O follow-up venceu na segunda.', href: '/dashboard/opportunities/x' },
            { id: 'n2', severity: 'info', title: 'Encontrei 8 conteúdos novos', detail: 'No seu Instagram, desde ontem.', href: '/dashboard/content' },
          ]}
        />
        <div className="card">
          <div className="cardHead">
            <span className="grip" aria-hidden="true"><i /><i /></span>
            <button type="button" className="icoBtn" aria-label="Abrir">+</button>
            <span className="n">CASA&DECOR</span>
            <span className="t">Casa & Decor — a marca que respondeu em dois dias</span>
            <button type="button" className="icoBtn mvUp" aria-label="Subir">↑</button>
            <button type="button" className="icoBtn mvDown" aria-label="Descer">↓</button>
            <button type="button" className="icoBtn" aria-label="Remover">✕</button>
          </div>
        </div>
        <ContentVault saved={[]} seeds={[]} broll={[]} braga={null} proof={[]} />
        <div className="fabStack" id="fabStack">
          <QuickCapture />
          <Assistant configured={false} />
          <button type="button" className="pvFab">Ver o site</button>
        </div>
      </>
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
            id: HISTORIA.id, title: HISTORIA.title, point: HISTORIA.meaning, beats: TOMADAS.length, durationSeconds: 42,
            shots: TOMADAS.map((t) => ({ shot: t.shot, note: t.note, required: true })),
            mustNotInvent: ['As duas horas aconteceram mesmo.'],
            moments: TOMADAS.map((t, i) => ({
              order: i + 1, purpose: ['Abrir', 'Mostrar', 'Virar', 'Fechar'][i] ?? 'Momento', intent: t.shot,
              line: i === 2 ? 'O primeiro take estava melhor. Duas horas para descobrir isso.' : null,
              visual: t.note ?? null, suggestion: i === 3,
            })),
            script: 'Passei quase duas horas mudando o cenário de um vídeo.\nTirei tudo da mesa, achei que o problema era o fundo.\nDepois fui ver o primeiro take. Estava melhor.\nEu complico tentando melhorar demais.',
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

  // A conversa da Cora, tal como está na base: o email da Estrella a indicar
  // marketing@cora.com.br, e a ação que sai dele. Os endereços são os reais;
  // o ID da thread é de bancada.
  if (modo === 'conversa' || modo === 'marca' || modo === 'conversas') {
    const corpo = `Olá Carol, como vai?\n\nAqui é a Estrella da equipe de atendimento da Cora.\n\nPor aqui, na equipe de Atendimento, nosso foco é o suporte diário e a ajuda direta aos nossos clientes em suas contas. Por isso, não somos nós quem gerenciamos as decisões de campanhas de anúncios ou contratações de novos criativos.\n\nNo entanto, para que a sua proposta de abordagem em vídeo e o seu portfólio sejam avaliados diretamente pelos nossos especialistas de marca, por favor, envie a sua apresentação para o e-mail abaixo:\n\nTime de Marketing - marketing@cora.com.br\n\nUm abraço,\nTime Cora`;
    const mensagens = [
      { id: 'm1', direction: 'outbound' as const, sentAt: dia(-4), fromAddress: 'carolxqueiroz05@gmail.com', fromName: 'Carolina', subject: 'UGC | Ideia de criativo para a Cora', body: 'Olá equipe! 😊 Estive dando uma olhada na comunicação de vocês nas mídias sociais e pensei num ângulo que pode funcionar muito bem para os anúncios pagos de vocês: a frustração de perder tempo com bancos tradicionais e resolver isso em segundos usando o app da Cora.' },
      { id: 'm2', direction: 'inbound' as const, sentAt: dia(-2), fromAddress: 'parcerias@cora.com.br', fromName: 'Estrella', subject: 'Re: UGC | Ideia de criativo para a Cora', body: corpo },
    ];
    const acao = nextActionForThread({
      threadId: '00000000-0000-4000-8000-000000000002', opportunityId: 'o-cora', brandId: 'b-cora', brandName: 'Cora',
      intent: 'REFERRAL', confidence: 0.92, waitingOn: 'carol', waitingSince: dia(-2),
      lastExternal: { id: 'm2', fromAddress: 'parcerias@cora.com.br', fromName: 'Estrella', bodyText: corpo, sentAt: dia(-2) },
      draft: null, recommendation: 'Enviar a proposta para o marketing.', whatTheyWant: 'Redirecionar para o time de marketing.',
      referred: extractReferredContacts(corpo, { exclude: ['parcerias@cora.com.br', 'carolxqueiroz05@gmail.com'] }),
      originalOutbound: { subject: mensagens[0].subject, body: mensagens[0].body },
    });

    if (modo === 'conversas') {
      const linha = (id: string, brand: string, subject: string, snippet: string, next: string | null, dir: 'inbound' | 'outbound', days: number) => ({
        id, provider: 'gmail', subject, participants: [], lastMessageAt: dia(-days), messageCount: 2, classification: 'commercial' as const,
        confidence: 1, reason: '', brandId: null, brandName: brand, opportunityId: null, stage: 'replied', lastDirection: dir, snippet, replyTypes: [], nextTitle: next, nextType: null,
      });
      return (
        <Inbox
          gmailConnected
          waiting={[
            linha('t-cora', 'Cora', 'Re: UGC | Ideia de criativo para a Cora', 'Por favor, envie a sua apresentação para o e-mail abaixo: Time de Marketing - marketing@cora.com.br', 'Escrever para marketing@cora.com.br', 'inbound', 2),
            linha('t-cecotec', 'Cecotec Portugal', 'Re: Colaboração UGC — briefing aprovado', 'Segue o código de rastreio da Conga Windroid. Sugerimos um close-up no vídeo.', 'Confirmar quando o produto chegar', 'inbound', 3),
          ]}
          review={[]}
          quiet={[
            linha('t-eleven', 'ElevenLabs', 'Re: Creators program', 'Our creator team is full at the moment — we added you to the waitlist.', 'Nada a fazer agora', 'inbound', 1),
            linha('t-lima', 'Lima Escape', 'Re: Proposta de colaboração UGC — Lima Escape', 'As parcerias deste ano já estão fechadas.', 'Nada a fazer agora', 'inbound', 1),
          ]}
        />
      );
    }

    if (modo === 'marca') {
      return (
        <>
          <div className="dashBar">
            <h1>Cora</h1>
            <span className="dashState">fit 74</span>
          </div>
          <section className="rel">
            <div className="relNow">
              <p className="relEyebrow">Situação agora</p>
              <p className="relLine">
                Estrella escreveu há 2 dias e está à espera. <span className="osTag" data-tone="mute">Respondeu</span>
              </p>
            </div>
            <div className="relNext">
              <p className="relEyebrow">Próxima ação</p>
              <h2>{acao.title}</h2>
              <p className="osWhy">{acao.reason}</p>
            </div>
            <div className="relWork">
              <p className="relEyebrow">Trabalho já preparado</p>
              <NextActionCard threadId="00000000-0000-4000-8000-000000000002" action={acao} whoWrote="Estrella" compact />
            </div>
          </section>
          <section className="osSection relConvo">
            <h2>Conversa</h2>
            <p className="osNote">UGC | Ideia de criativo para a Cora · <a href="#">Abrir a conversa completa</a></p>
            <Conversation messages={mensagens} brandName="Cora" compact />
          </section>
        </>
      );
    }

    // Sem o `.pick`: é um scrim animado, e numa bancada estática fica a meio
    // da animação. Aqui interessa a gaveta, não a entrada dela.
    return (
      <div style={{ maxWidth: 760, margin: '24px auto', padding: '0 8px' }}>
        <div className="mailBox" style={{ background: 'var(--papel)' }}>
          <header className="mailHead">
            <div>
              <h2>Re: UGC | Ideia de criativo para a Cora</h2>
              <p className="osRowSub">Cora · 2 mensagens</p>
            </div>
          </header>
          <div className="mailScroll">
            <div className="mailGist">
              <div className="mailGistTop">
                <p className="mailGistAsk">Estrella: Redirecionar para o time de marketing.</p>
                <span className="aiBadge"><i aria-hidden="true" />Powered by CarolAI</span>
              </div>
            </div>
            <NextActionCard threadId="00000000-0000-4000-8000-000000000002" action={acao} whoWrote="Estrella" />
            <h3 className="mailConvoTitle">A conversa</h3>
            <Conversation messages={mensagens} brandName="Cora" />
          </div>
        </div>
      </div>
    );
  }

  if (modo === 'auditoria' || modo === 'auditoria-vazia') {
    const vaziaAud = modo === 'auditoria-vazia';
    const tela = auditoriaFixture(vaziaAud);
    return (
      <>
        <div className="dashBar">
          <h1>Conteúdo</h1>
          <span className="dashState">{vaziaAud ? 'sem histórico ainda' : '18 conteúdos medidos'}</span>
        </div>
        <Audit screen={tela} explore={<p className="osNote">(o detalhe peça a peça vive na cena «inteligencia»)</p>} />
      </>
    );
  }

  if (modo === 'inteligencia' || modo === 'inteligencia-feed' || modo === 'inteligencia-stories') {
    const leitura = (metric: string, ratio: number | null) =>
      ratio === null
        ? { metric, value: null, median: null, ratio: null, reading: `${metric}: indisponível`, comparable: false }
        : { metric, value: Math.round(ratio * 1800), median: 1800, ratio, reading: `${metric}: ${ratio}× a sua mediana`, comparable: true };
    const peca = (id: string, title: string, at: string, tags: { format: string | null; theme: string | null; hook: string | null }, readings: ReturnType<typeof leitura>[], mechanism: string | null = null): FeedPieceInput => ({
      mediaId: id, title, publishedAt: at, mediaProductType: 'REELS', pillarLabel: mechanism ? 'Atração' : null, mechanism,
      tags: { ...tags, source: tags.format ? 'ai_caption' : null, confidence: tags.format ? 0.7 : null },
      readings, latestKind: 'latest', readingAgeDays: 60,
    });
    const entradas: FeedPieceInput[] = [
      peca('f1', 'O cenário que eu compliquei', dia(-9), { format: 'humor', theme: 'cenário de gravação', hook: 'contraste' }, [leitura('views', 1.4), leitura('reach', 1.6), leitura('comments', 2.2)], '«eu complico tentando melhorar demais», falando'),
      peca('f2', 'Uma coisa não tem nada a ver com a outra', dia(-30), { format: 'humor', theme: 'vida em Braga', hook: 'humor' }, [leitura('views', 1.1), leitura('reach', 1.0), leitura('comments', 1.7)]),
      peca('f3', 'Charabanc · montagem', dia(-120), { format: 'estético', theme: 'hotel', hook: 'sem gancho' }, [leitura('views', 6.9), leitura('reach', 4.1), leitura('comments', 0.6)]),
      peca('f4', 'Café e edição', dia(-200), { format: 'estético', theme: 'rotina', hook: 'sem gancho' }, [leitura('views', 0.8), leitura('reach', 0.7), leitura('comments', 0.5)]),
      peca('f5', 'Setup de luz natural', dia(-260), { format: 'estético', theme: 'gravação', hook: 'resultado primeiro' }, [leitura('views', 1.0), leitura('reach', 0.9), leitura('comments', 0.4)]),
      peca('f6', 'Primeiro vídeo em inglês', dia(-40), { format: 'falando', theme: 'inglês', hook: 'abertura de história' }, [leitura('views', 0.9), leitura('reach', 0.8), leitura('comments', 1.2)]),
      peca('f7', 'Reel de 2023', '2023-02-26T19:57:08Z', { format: null, theme: null, hook: null }, [leitura('views', null)]),
    ];
    const pecas = entradas.map((p) => ({ input: p, audit: auditPiece(p) }));
    const feed: FeedAuditView = {
      pieces: pecas.map(({ input, audit }, i) => ({ ...input, audit, permalink: i === 0 ? 'https://www.instagram.com/reel/DctIXdHM14l/' : null, isSharedToFeed: i === 0, storyTitle: null, experiment: null })),
      summary: feedSummary(pecas),
      sample: { total: 7, comparable: 6, legacy: 6, recent: 1, withTags: 6 },
      lastSyncAt: dia(0),
    };
    const frames = (n: number, base: number, day: number, replies: number) =>
      Array.from({ length: n }, (_, i) => ({
        id: `s${day}-${i}`, publishedAt: new Date(Date.now() + day * 86400000 + i * 600000).toISOString(),
        reach: Math.round(base * (1 - i * 0.06)), views: null, replies: i === 0 ? replies : 0, shares: null, navigation: null, profileActivity: null, follows: null,
      }));
    const seq = (id: string, label: string, day: number, n: number, base: number, replies: number, tags: string[]) => {
      const fr = frames(n, base, day, replies);
      return {
        id, label, startedAt: fr[0].publishedAt, endedAt: fr[fr.length - 1].publishedAt, storyCount: n, tags, locked: false,
        metrics: sequenceMetrics(fr), comparison: null as string | null,
        frames: fr.map((f) => ({ id: f.id, publishedAt: f.publishedAt, permalink: null, reach: f.reach, replies: f.replies, expiredAt: day < 0 ? f.publishedAt : null, measuredAt: f.publishedAt })),
      };
    };
    const stories: StoryAuditView = {
      coverage: { since: dia(-3), line: 'Histórico automático de Stories desde 06/09/2026. O que veio antes não está disponível na API.' },
      active: 5, expired: 9,
      sequences: [
        { ...seq('q1', 'Bastidores de gravação · terça-feira', 0, 5, 312, 8, ['bts', 'talking']), comparison: 'Melhor que 4 das últimas 5 sequências de tamanho comparável.' },
        seq('q2', 'Treino e café · segunda-feira', -1, 4, 260, 2, ['gym', 'routine']),
        seq('q3', 'Pergunta para vocês · domingo', -2, 3, 280, 11, ['poll']),
        seq('q4', 'Só B-roll · sábado', -3, 2, 190, 0, ['aesthetic']),
      ],
      guidance: { lines: [], because: 'Ainda não sei: 4 sequências medidas nas últimas 4 semanas. Preciso de pelo menos 6 para comparar.' },
      policyVersion: 'CAROL_STORY_SEQUENCE_V1',
    };
    return (
      <>
        <div className="dashBar">
          <h1>Conteúdo</h1>
          <span className="dashState">7 peças medidas</span>
        </div>
        <ContentIntelligence
          pieces={PECAS_PUBLICADAS}
          learnings={APRENDIZADOS}
          lastSyncAt={dia(0)}
          feed={feed}
          stories={stories}
          initial={modo === 'inteligencia-feed' ? 'feed' : modo === 'inteligencia-stories' ? 'stories' : 'learn'}
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
        guideSeen: modo !== 'primeira-vez',
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
