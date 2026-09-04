import assert from 'node:assert/strict';
import test from 'node:test';

import * as registry from '../prompts/registry.ts';
import {
  PILLARS,
  PILLAR_SPEC,
  RESEARCH_MARKET,
  STRATEGY,
  STRATEGY_SOURCE,
  describeRejections,
  genericProblems,
  guruProblems,
  platformTreatmentsDiffer,
  qualityVerdict,
  replaceability,
} from '../../creator/domain.ts';
import { deriveMilestones } from '../../milestones/domain.ts';
import { referenceProblems } from '../../references/domain.ts';
import { trendFit, trendProblems } from '../../trends/domain.ts';
import { guessIntent, readThreadState } from '../../email/thread-state.ts';

/** Os dez casos de avaliação do Morning Autopilot.
 *
 *  Cada um vem do briefing e cada um tem aqui a verificação mais forte que é
 *  possível fazer sem chamar um modelo:
 *
 *    comportamental  a regra vive em código puro, e o teste exercita-a
 *    estrutural      a regra vive no prompt, e o teste exige que lá esteja
 *
 *  A distinção está escrita em cada caso de propósito. Uma garantia estrutural
 *  é mais fraca do que uma comportamental — verifica que a instrução existe,
 *  não que o modelo lhe obedeceu — e chamar-lhe outra coisa seria mentir sobre
 *  o que o CI protege. O que precisa de modelo corre em `npm run eval:ai`. */

const NOW = new Date('2026-09-02T00:00:00Z');

type PromptShape = { task: string; system: string };
const PROMPTS = (Object.values(registry) as unknown[]).filter(
  (v): v is PromptShape =>
    typeof v === 'object' && v !== null && 'task' in v && 'system' in v,
);
const prompt = (task: string) => {
  const p = PROMPTS.find((x) => x.task === task);
  assert.ok(p, `o prompt «${task}» desapareceu`);
  return p.system;
};

const GUIAO =
  'Abro com dois vídeos lado a lado, digo que um vendeu e o outro não, e mostro ' +
  'que a diferença foi o gancho e não a luz. Fecho com a timeline do CapCut à vista ' +
  'e a pergunta de qual escolheriam.';

/* ── 1. Conteúdo de técnica de UGC: autoridade, não dicas genéricas ──────── */

test('caso 1 · comportamental: um ângulo genérico sobre UGC não passa', () => {
  assert.ok(
    genericProblems({ hook: '5 dicas para ser UGC creator em 2026', script: GUIAO }).some((p) =>
      p.includes('lugar-comum'),
    ),
  );
  assert.deepEqual(
    genericProblems({
      hook: 'O maior erro que cometi em UGC foi tentar deixar tudo bonito antes de o pôr a vender',
      script: GUIAO,
    }),
    [],
  );
});

test('caso 1 · comportamental: sem originalidade a média não salva a ideia', () => {
  const generica = qualityVerdict({
    carolIdentity: 95, story: 95, proof: 95, humanConflict: 95, brandSignal: 95,
    engagement: 95, originality: 25, recordability: 95, platformNative: 95,
    authorityWithoutPreaching: 95,
  });
  assert.equal(generica.verdict, 'reject');
});

/* ── 2. Marco pessoal: só a partir de um evento real ─────────────────────── */

test('caso 2 · comportamental: sem fato gravado não nasce marco nenhum', () => {
  assert.deepEqual(deriveMilestones({ payments: [], events: [], homeCountry: 'PT' }), []);
});

test('caso 2 · comportamental: o marco que nasce traz a prova de onde veio', () => {
  const marcos = deriveMilestones({
    homeCountry: 'PT',
    payments: [
      {
        id: 'p1', brandId: 'b1', brandName: 'UGREEN', brandCountry: 'CN',
        kind: 'cash', amountCents: 40000, currency: 'EUR', receivedAt: '2026-08-14T00:00:00Z',
      },
    ],
    events: [],
  });
  const fora = marcos.find((m) => m.kind === 'first_international_client');
  assert.ok(fora, 'o primeiro cliente de fora não foi derivado');
  assert.equal(fora.evidence[0].id, 'p1');
});

test('caso 2 · estrutural: o plano de conteúdo é proibido de inventar conquistas', () => {
  assert.match(prompt('daily_content_plan'), /NÃO INVENTES CONQUISTAS/);
});

/* ── 3. Instagram e TikTok tratados de forma nativa ──────────────────────── */

test('caso 3 · comportamental: o mesmo vídeo nas duas plataformas é apanhado', () => {
  const igual = platformTreatmentsDiffer(
    { platform: 'instagram', hook: 'Um UGC bonito pode ser um anúncio mau', format: 'reel', script: GUIAO },
    { platform: 'tiktok', hook: 'Um UGC bonito pode ser um anúncio mau', format: 'reel', script: GUIAO },
  );
  assert.equal(igual.differ, false);
});

test('caso 3 · estrutural: o prompt diz o que cada plataforma pede, e exige a diferença', () => {
  const p = prompt('daily_content_plan');
  assert.match(p, /O mesmo ADN, execução diferente/);
  assert.match(p, /why_they_differ/);
  assert.match(p, /Reel republicado no\s+TikTok/);
});

/* ── 4. Tendência antiga não é recomendada como atual ───────────────────── */

const tendencia = (over: Record<string, unknown> = {}) => ({
  title: 'Breakdown de edição em tela dividido',
  kind: 'editing' as const,
  platform: 'tiktok' as const,
  description: 'O criador mostra a timeline do CapCut ao lado do vídeo final.',
  whyTrending: 'Aparece em vários perfis de edição desde meados de Agosto.',
  evidence: [{ url: 'https://www.tiktok.com/@editor/video/999' }],
  publishedAt: '2026-08-26',
  detectedAt: '2026-09-02T06:35:00Z',
  ...over,
});

const perfil = {
  topics: ['edição', 'ugc'],
  avoidedFormats: ['dança'],
  talkingHeadTolerance: 0.7,
  editingComplexity: 0.6,
};

test('caso 4 · comportamental: uma tendência de há meses é recusada', () => {
  const velha = trendFit({ trend: tendencia({ publishedAt: '2026-01-10' }), ...perfil, now: NOW });
  assert.equal(velha.freshness, 'stale');
  assert.equal(velha.verdict, 'skip');
});

/* ── 5. Viral mas irrelevante: recusar ───────────────────────────────────── */

test('caso 5 · comportamental: o que não serve a imagem dela é vetado, não pontuado', () => {
  const viral = trendFit({
    trend: tendencia({
      title: 'Prank no supermercado',
      kind: 'format',
      description: 'Uma pegadinha polémica a estranhos, com milhões de visualizações.',
      whyTrending: 'Está em todo o lado esta semana.',
    }),
    ...perfil,
    now: NOW,
  });
  assert.equal(viral.verdict, 'skip');
  assert.equal(viral.score, 0, 'o veto tem de zerar, não descontar');
});

/* ── 6. Referência de marca: a adaptação nomeia a marca ──────────────────── */

test('caso 6 · comportamental: uma referência sem adaptação nem endereço não entra', () => {
  assert.ok(referenceProblems({ sourceUrl: 'vi no TikTok', whyItWorks: 'boa' }).length >= 2);
});

test('caso 6 · estrutural: o prompt exige o produto desta marca na adaptação', () => {
  const p = prompt('creative_references');
  assert.match(p, /A adaptação nomeia o produto DESTA marca/);
  assert.match(p, /não inventes um: deixa a referência de fora|Se o texto não trouxer um URL/);
});

/* ── 7. Vídeo de concorrente: inspiração, nunca cópia ────────────────────── */

test('caso 7 · estrutural: os dois prompts criativos proíbem a cópia literal', () => {
  assert.match(prompt('creative_references'), /nunca para cópia literal/);
  assert.match(prompt('brand_ready_idea'), /INSPIRADA nas referências, nunca copiada/);
});

/* ── 8. A última mensagem é dela, mas existe resposta da marca ───────────── */

test('caso 8 · comportamental: a classificação usa o estado externo correto', () => {
  const state = readThreadState(
    [
      {
        id: '1', direction: 'inbound', sentAt: '2026-08-25T10:00:00Z',
        bodyText: 'Queremos avançar com uma colaboração paga. Temos budget disponível.',
      },
      {
        id: '2', direction: 'outbound', sentAt: '2026-08-26T10:00:00Z',
        bodyText: 'Claro! Envio já o meu portfólio com exemplos de trabalhos.',
      },
    ],
    NOW,
  );
  assert.equal(state.lastExternal?.id, '1');
  assert.equal(state.last?.id, '2');
  assert.equal(state.waitingOn, 'brand');
  assert.equal(guessIntent(state).intent, 'PAID_COLLAB');
});

test('caso 8 · estrutural: o prompt diz explicitamente o que classificar', () => {
  const p = prompt('thread_intel');
  assert.match(p, /última mensagem da MARCA/);
  assert.match(p, /Nunca a última mensagem da\s+conversa/);
});

/* ── 9. Pedido de direitos pagos: a resposta respeita o motor ────────────── */

test('caso 9 · estrutural: o prompt de leitura recebe direitos e proíbe conceder', () => {
  const p = prompt('thread_intel');
  assert.match(p, /não concedes prazos, não aceitas exclusividade nem\s+perpetuidade/);
  assert.match(p, /só podes dizer o que vem calculado no contexto/);
});

test('caso 9 · comportamental: uma intenção de direitos conta como urgente', () => {
  const state = readThreadState(
    [
      {
        id: '1', direction: 'inbound', sentAt: '2026-09-01T10:00:00Z',
        bodyText: 'Precisamos dos direitos de uso para anúncios pagos durante uns meses.',
      },
    ],
    NOW,
  );
  assert.equal(guessIntent(state).intent, 'USAGE_RIGHTS');
});

/* ── 10. Sem fonte fiável: não fabricar ──────────────────────────────────── */

test('caso 10 · comportamental: uma tendência sem prova clicável é recusada', () => {
  assert.ok(trendProblems(tendencia({ evidence: [] })).includes('sem prova clicável'));
  assert.ok(trendProblems(tendencia({ evidence: [{ url: 'vi no TikTok' }] })).includes('sem prova clicável'));
});

test('caso 10 · estrutural: os prompts de pesquisa proíbem inventar endereços e datas', () => {
  assert.match(prompt('creator_trends'), /Sem endereço, não entra/);
  assert.match(prompt('creator_trends'), /Não estimes uma data/);
  assert.match(prompt('creator_profile'), /NUNCA finjas ter analisado dados a que não chegaste/);
});

/* ── Os prompts novos entram nas garantias que já existiam ───────────────── */

test('os prompts do autopilot têm versão e não carregam preço', () => {
  const novos = ['thread_intel', 'creative_references', 'brand_ready_idea', 'creator_trends', 'creator_profile', 'daily_content_plan', 'content_multiplier'];
  const PRICE = /\b\d{2,4}\s?(€|eur)\b|\+\s?\d{2,3}\s?%/i;
  for (const task of novos) {
    const p = (Object.values(registry) as unknown[]).find(
      (v): v is { task: string; version: string; system: string } =>
        typeof v === 'object' && v !== null && 'task' in v && (v as { task: string }).task === task,
    );
    assert.ok(p, `falta o prompt «${task}»`);
    assert.match(p.version, /^v\d+$/, `${task}: versão tem de ser vN`);
    assert.doesNotMatch(p.system, PRICE, `${task}: tem um valor escrito no prompt`);
  }
});

/* ── A auditoria do Instagram (02/09/2026) ────────────────────────────────
   Sete verificações novas. As três primeiras são as correções que a auditoria
   forçou; as outras são regras que ela acrescentou. */

test('auditoria · os pilares são os cinco reais, não os genéricos', () => {
  assert.deepEqual([...PILLARS], ['A_SALA', 'TESTEI', 'CASA_A_DOIS', 'CORPO', 'LARGUEI_O_TURNO']);
  // «FORÇADO e errado para este perfil», nas palavras da auditoria.
  for (const morto of ['CREATOR_EDUCATION', 'UGC_AUTHORITY', 'CREATIVE_STRATEGY']) {
    assert.equal(PILLARS.includes(morto as never), false, morto);
  }
});

test('auditoria · a sala tem o maior peso, e é o que estava desperdiçado', () => {
  const pesos = PILLARS.map((p) => PILLAR_SPEC[p].weight);
  assert.equal(Math.max(...pesos), PILLAR_SPEC.A_SALA.weight);
  assert.equal(PILLAR_SPEC.A_SALA.weight, 0.3);
});

test('auditoria · autoridade sim, professora não — no código e no prompt', () => {
  assert.ok(guruProblems({ hook: '5 dicas para ser UGC creator' }).length > 0);
  const p = prompt('daily_content_plan');
  assert.match(p, /AUTORIDADE SIM\. PROFESSORA NÃO\./);
  assert.match(p, /MOSTRA competência; nunca a afirma/);
});

test('auditoria · «é substituível?» está no código e é veto de qualidade', () => {
  assert.equal(
    replaceability({ hook: 'Três formas de melhorar a luz num vídeo', script: 'Comparo janela e candeeiro.' })
      .replaceable,
    true,
  );
  const semElaLaDentro = qualityVerdict({
    carolIdentity: 20, story: 95, proof: 95, humanConflict: 95, brandSignal: 95,
    engagement: 95, originality: 95, recordability: 95, platformNative: 95,
    authorityWithoutPreaching: 95,
  });
  assert.equal(semElaLaDentro.verdict, 'reject');
});

test('auditoria · o Instagram é para pessoas e o site para marcas', () => {
  const p = prompt('daily_content_plan');
  assert.match(p, /O INSTAGRAM É PARA PESSOAS/);
  assert.match(p, /só entra no feed quando TAMBÉM é um episódio da vida/);
});

test('auditoria · documentar, não ensinar', () => {
  const p = prompt('daily_content_plan');
  assert.match(p, /Ela conta a experiência\. Não vende método/);
});

test('auditoria · as referências e as tendências são brasileiras', () => {
  assert.equal(RESEARCH_MARKET.primary, 'Brasil');
  assert.match(RESEARCH_MARKET.instruction, /SÓ criadores brasileiros/);
  assert.match(RESEARCH_MARKET.instruction, /Não devolvas creators portugueses/);
});

test('auditoria · fica gravada como fonte versionada, e sem métricas', () => {
  assert.equal(STRATEGY.version, 'CAROL_CONTENT_STRATEGY_V1');
  assert.equal(STRATEGY_SOURCE.observedAt, '2026-09-02');
  // A auditoria não conseguiu ver views nem retenção. A autoridade dela sobre
  // números é nenhuma, e isso tem de estar escrito onde alguém o leia.
  assert.match(STRATEGY_SOURCE.authority, /none for metrics/);
  for (const h of STRATEGY.hypotheses) {
    assert.equal(h.status, 'untested', `${h.id} foi dado como testado sem dados`);
  }
});

/* ── Recusa · o que ela recusa tem de chegar ao gerador ───────────────────── */

test('recusa · o motivo entra no prompt do plano, com o que fazer em vez disso', () => {
  // Sem isto, recusar era um estado morto: a ideia saía da tela e a manhã
  // seguinte escrevia a mesma coisa com outras palavras. O teste protege a
  // ligação inteira — motivo salvo, motivo descrito, motivo no prompt.
  const texto = registry.planDailyContent.render({
    today: '2026-09-03',
    strategy: '',
    profile: '',
    pillars: '',
    avoidPillars: '',
    audienceTilt: '',
    trends: '',
    milestones: '',
    jobs: '',
    energy: '',
    recentIdeas: '',
    rejected: describeRejections([
      { hook: '3 erros que as marcas cometem', reason: 'teaching' },
      { hook: 'o guia completo de UGC', reason: 'teaching' },
    ]),
    series: '',
    seeds: '',
    exemplars: '',
    instagramBrief: '',
    tiktokBrief: '',
    playbook: '',
    balance: '',
    broll: '',
    testPlan: '',
  });

  assert.match(texto, /JÁ RECUSOU/);
  assert.match(texto, /Recusou 2 por «Está me pondo a dar aula»/);
  assert.match(texto, /mostra em vez de explicar/);
});

test('recusa · sem recusas o prompt não inventa um padrão', () => {
  const texto = registry.planDailyContent.render({
    today: '2026-09-03',
    strategy: '', profile: '', pillars: '', avoidPillars: '', audienceTilt: '',
    trends: '', milestones: '', jobs: '', energy: '', recentIdeas: '',
    rejected: describeRejections([]),
    series: '', seeds: '', exemplars: '', instagramBrief: '', tiktokBrief: '',
    playbook: '', balance: '', broll: '', testPlan: '',
  });
  assert.match(texto, /não inventes um padrão/);
});

test('recusa · mudar o que se pede obriga a subir a versão do prompt', () => {
  assert.equal(registry.planDailyContent.version, 'v5');
});

test('recusa · o plano é escrito em português do Brasil, sem exceção', () => {
  // «A primeira vez que me pediram a ementa em inglês» saiu numa corrida real.
  // A regra da língua estava só no bloco partilhado e não chegava aqui.
  const sistema = registry.planDailyContent.system;
  assert.match(sistema, /Português do Brasil, sempre/);
  assert.match(sistema, /O gerúndio é a forma natural dela/);
  for (const palavra of ['ementa', 'ecrã', 'telemóvel', 'ficheiro', 'equipa', 'reparei']) {
    assert.ok(sistema.includes(`«${palavra}»`), `o prompt não proíbe «${palavra}»`);
  }
});
