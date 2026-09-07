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
import ContentVault from '@/components/dashboard/os/ContentVault';
import Notifications from '@/components/dashboard/Notifications';
import QuickCapture from '@/components/dashboard/QuickCapture';
import Assistant from '@/components/assistant/Assistant';
import type { FeedAuditView, StoryAuditView } from '@/modules/content-brain/performance-service';
import { auditPiece, feedSummary, type FeedPieceInput } from '@/modules/content-brain/feed-audit';
import { sequenceMetrics } from '@/modules/content-brain/stories';

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
      pieces: pecas.map(({ input, audit }, i) => ({ ...input, audit, permalink: i === 0 ? 'https://www.instagram.com/reel/DctIXdHM14l/' : null, isSharedToFeed: i === 0, storyTitle: null })),
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
