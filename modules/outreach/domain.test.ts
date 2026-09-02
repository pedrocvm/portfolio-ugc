import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dedupe,
  LIMITS,
  rankScore,
  scoreEmail,
  selectDaily,
  strategyFor,
  suppress,
  type Known,
  type Rankable,
  runMessage,
  type RunSummary,
  enoughToChooseFrom,
  partitionDaily,
  groupForReview,
  sectionFor,
  SECTION_TITLE,
  SECTION_HINT,
  SECTION_ORDER,
} from './domain.ts';

const known = (over: Partial<Known> = {}): Known => ({
  normalizedNames: new Set<string>(),
  domains: new Set<string>(),
  snoozed: new Map<string, string>(),
  ...over,
});

const NOW = new Date('2026-09-01T09:00:00Z');

/* ── estratégia ─────────────────────────────────────────────────────────── */

test('o mesmo dia dá a mesma estratégia: correr duas vezes não procura outra coisa', () => {
  assert.deepEqual(strategyFor(new Date('2026-09-01')), strategyFor(new Date('2026-09-01')));
});

test('dias diferentes procuram coisas diferentes', () => {
  const a = strategyFor(new Date('2026-09-01'));
  const b = strategyFor(new Date('2026-09-05'));
  assert.notDeepEqual([a.niches, a.angle], [b.niches, b.angle]);
});

test('nunca sai um nicho excluído na estratégia', () => {
  for (let d = 0; d < 40; d++) {
    const s = strategyFor(new Date(2026, 8, 1 + d));
    assert.ok(!s.niches.includes('skincare'), `dia ${d} trouxe skincare`);
    assert.ok(!s.niches.includes('haircare'), `dia ${d} trouxe haircare`);
  }
});

test('o que saiu há pouco vai para o fim da fila', () => {
  const base = strategyFor(new Date('2026-09-01'));
  const evitando = strategyFor(new Date('2026-09-01'), base.niches);
  assert.notDeepEqual(base.niches, evitando.niches);
});

/* ── supressão ──────────────────────────────────────────────────────────── */

test('uma marca já no CRM não volta como nova', () => {
  const r = suppress({ name: 'Cecotec' }, known({ normalizedNames: new Set(['cecotec']) }), NOW);
  assert.deepEqual(r, { blocked: true, reason: 'known_brand' });
});

test('o mesmo domínio com outro nome também é bloqueado', () => {
  const r = suppress(
    { name: 'Cecotec Portugal Lda', website: 'https://www.cecotec.es/pt' },
    known({ domains: new Set(['cecotec.es']) }),
    NOW,
  );
  assert.deepEqual(r, { blocked: true, reason: 'known_domain' });
});

test('skincare não passa pelo nicho mapeado', () => {
  const r = suppress({ name: 'Marca Nova', nicheId: 'beauty' }, known(), NOW);
  assert.deepEqual(r, { blocked: true, reason: 'excluded_niche' });
});

test('skincare também não passa quando o nicho vem por classificar', () => {
  // A descoberta devolve texto livre; confiar só no id deixava passar isto.
  const r = suppress(
    { name: 'Glow Lab', description: 'sérum facial e creme hidratante para a pele' },
    known(),
    NOW,
  );
  assert.deepEqual(r, { blocked: true, reason: 'excluded_niche' });
});

test('haircare idem', () => {
  const r = suppress({ name: 'X', description: 'champô e condicionador para cabelo' }, known(), NOW);
  assert.deepEqual(r, { blocked: true, reason: 'excluded_niche' });
});

test('um robô aspirador não é confundido com beleza', () => {
  const r = suppress({ name: 'Cecotec', description: 'robô aspirador para casa' }, known(), NOW);
  assert.equal(r.blocked, false);
});

test('adormecida não aparece antes da data, e aparece depois', () => {
  const s = known({ snoozed: new Map([['tempur', '2026-10-01T00:00:00Z']]) });
  assert.equal(suppress({ name: 'Tempur' }, s, NOW).blocked, true);
  assert.equal(suppress({ name: 'Tempur' }, s, new Date('2026-10-02')).blocked, false);
});

test('uma marca desconhecida passa', () => {
  assert.deepEqual(suppress({ name: 'Novoteck', website: 'novoteck.io' }, known(), NOW), { blocked: false });
});

/* ── deduplicação ───────────────────────────────────────────────────────── */

test('a mesma empresa com dois nomes conta uma vez, pelo domínio', () => {
  const out = dedupe([
    { name: 'PetMaison', website: 'https://petmaison.pt' },
    { name: 'Pet Maison Portugal', website: 'http://www.petmaison.pt/loja' },
  ]);
  assert.equal(out.length, 1);
});

test('sem domínio, o nome normalizado serve de último recurso', () => {
  assert.equal(dedupe([{ name: 'Xiaomi' }, { name: 'XIAOMI' }]).length, 1);
});

test('empresas diferentes ficam as duas', () => {
  assert.equal(dedupe([{ name: 'A', domain: 'a.com' }, { name: 'B', domain: 'b.com' }]).length, 2);
});

/* ── porta de qualidade ─────────────────────────────────────────────────── */

const goodEmail = {
  subject: 'Uma ideia para o Conga Windroid',
  brandName: 'Cecotec',
  product: 'Conga Windroid',
  body:
    'Olá Camila! 😊\n\n' +
    'Meu nome é Carolina Queiroz, sou criadora de conteúdo UGC e trabalho criando vídeos para ' +
    'marcas de um jeito mais natural, com cara de conteúdo que a gente realmente pararia para ' +
    'assistir.\n\n' +
    'Vi que a Cecotec lançou o Conga Windroid e que os anúncios mostram o robô limpando, mas ' +
    'nenhum mostra a parte chata que ele elimina — subir num escadote para limpar vidros.\n\n' +
    'A ideia seria mostrar o antes e o depois do vidro numa manhã normal, gravado em casa, ' +
    'sem estúdio.\n\n' +
    'Portfólio:\nhttps://carolqueiroz.pt/\n\n' +
    'Faz sentido falarmos esta semana?\n\nObrigada!\nCarolina',
  claims: [
    { text: 'lançou o Conga Windroid', sourceId: 'src1' },
    { text: 'anúncios mostram o robô limpando', sourceId: 'src2' },
  ],
};

test('um email pesquisado e concreto passa', () => {
  const r = scoreEmail(goodEmail);
  assert.equal(r.pass, true, r.failures.join(' | '));
  assert.ok(r.score >= 70);
});

test('um email que serve para qualquer empresa é rejeitado', () => {
  const r = scoreEmail({
    subject: 'Parceria UGC',
    brandName: 'Cecotec',
    product: null,
    body:
      'Olá, espero que estejam bem. Adoro a vossa marca e gostaria de propor uma parceria. ' +
      'Acredito que podemos criar algo incrível juntos. Fico à espera de novidades.',
    claims: [],
  });
  assert.equal(r.pass, false);
  assert.ok(r.failures.some((f) => f.includes('genéricas')));
  assert.ok(r.failures.some((f) => f.includes('produto')));
});

test('sem a apresentação dela na abertura, não passa', () => {
  const r = scoreEmail({
    ...goodEmail,
    body: goodEmail.body.replace(
      /Meu nome é Carolina Queiroz, sou criadora de conteúdo UGC e trabalho criando/,
      'Trabalho com UGC e crio',
    ),
  });
  assert.equal(r.pass, false);
  assert.ok(r.failures.includes('não se apresenta na abertura'));
});

test('a apresentação em corporativês é apanhada como genérica', () => {
  const r = scoreEmail({
    ...goodEmail,
    body: goodEmail.body.replace(
      'sou criadora de conteúdo UGC',
      'sou apaixonada por criação de conteúdo',
    ),
  });
  assert.equal(r.pass, false);
  assert.ok(r.failures.some((f) => f.includes('genéricas')));
});

test('uma afirmação sem fonte reprova o email', () => {
  const r = scoreEmail({
    ...goodEmail,
    claims: [
      { text: 'lançou o Conga Windroid', sourceId: 'src1' },
      { text: 'estão investindo muito em TikTok', sourceId: null },
    ],
  });
  assert.equal(r.pass, false);
  assert.ok(r.failures.some((f) => f.includes('sem fonte')));
});

test('sem pedido no fim, não passa', () => {
  const semCta = goodEmail.body.replace('Faz sentido falarmos esta semana?', 'Obrigada.');
  const r = scoreEmail({ ...goodEmail, body: semCta });
  assert.ok(r.failures.includes('sem pedido claro no fim'));
});

test('um assunto de catálogo é apanhado', () => {
  const r = scoreEmail({ ...goodEmail, subject: 'UGC Collaboration' });
  assert.ok(r.failures.includes('assunto genérico'));
});

test('um email enorme não passa', () => {
  const r = scoreEmail({ ...goodEmail, body: `${goodEmail.body} ${'palavra '.repeat(300)}` });
  assert.ok(r.failures.some((f) => f.includes('longo')));
});

/* ── ordenação e escolha ────────────────────────────────────────────────── */

const cand = (over: Partial<Rankable> = {}): Rankable => ({
  fitScore: 80, quality: 80, paidMediaSignal: 'medium', emailConfidence: 'high', redFlags: [], ...over,
});

test('quem anuncia a sério sobe', () => {
  assert.ok(rankScore(cand({ paidMediaSignal: 'strong' })) > rankScore(cand({ paidMediaSignal: 'none' })));
});

test('um contato em que não se confia desce', () => {
  assert.ok(rankScore(cand({ emailConfidence: 'verified' })) > rankScore(cand({ emailConfidence: 'unknown' })));
});

test('bandeiras vermelhas descem sem eliminar', () => {
  const com = cand({ redFlags: ['dropshipping', 'sem marketing'] });
  assert.ok(rankScore(com) < rankScore(cand()));
  assert.equal(selectDaily([com]).length, 1);
});

test('abaixo do mínimo de encaixe não entra, mesmo que seja o único', () => {
  assert.deepEqual(selectDaily([cand({ fitScore: 60 })]), []);
});

test('seis boas devolvem seis: não se enche a lista para chegar a oito', () => {
  const seis = Array.from({ length: 6 }, () => cand());
  assert.equal(selectDaily(seis).length, 6);
});

test('nunca mais do que o máximo do dia', () => {
  const muitas = Array.from({ length: 30 }, (_, i) => cand({ fitScore: 71 + (i % 20) }));
  assert.equal(selectDaily(muitas).length, LIMITS.max);
});

test('vem ordenado, o melhor primeiro', () => {
  const out = selectDaily([cand({ fitScore: 72 }), cand({ fitScore: 95 }), cand({ fitScore: 80 })]);
  assert.deepEqual(out.map((c) => c.fitScore), [95, 80, 72]);
});

/* ── O que a procura diz quando corre mal ─────────────────────────────────── */

const run = (over: Partial<RunSummary> = {}): RunSummary => ({
  status: 'empty',
  discovered: 0,
  screened: 0,
  researched: 0,
  selected: 0,
  failures: [],
  blocked: null,
  below: 0,
  ...over,
});

test('nenhuma mensagem da procura leva JSON, chaves ou um link', () => {
  const casos = [
    run({ status: 'error', blocked: 'A IA chegou a um limite de uso. Espere um minuto.' }),
    run({ discovered: 0 }),
    run({ discovered: 7 }),
    run({ discovered: 7, screened: 3, researched: 2 }),
    run({ status: 'success', discovered: 9, selected: 4 }),
    run({ status: 'partial', discovered: 5, screened: 5, researched: 5, selected: 1, failures: ['Não consegui pesquisar a Cecotec.'] }),
  ];
  for (const c of casos) {
    const { message } = runMessage(c);
    assert.doesNotMatch(message, /[{}"[\]]|https?:|_[A-Z]|\b\d{3}\b(?! )/, `código na mensagem: ${message}`);
  }
});

test('quando a procura não chegou a andar, a razão é a mensagem inteira', () => {
  const limite = 'A IA chegou a um limite de uso. Espere um minuto e tente outra vez.';
  const { ok, message } = runMessage(run({ status: 'error', blocked: limite }));
  assert.equal(ok, false);
  assert.equal(message, limite);
  // O defeito que a Carol viu: mandar mudar a busca quando a busca nem correu.
  assert.doesNotMatch(message, /busca mais concreta/);
});

test('zero por a pesquisa não achar nada não é zero por a IA falhar', () => {
  const vazio = runMessage(run({ discovered: 0 })).message;
  const falhou = runMessage(run({ status: 'error', blocked: 'A IA está fora do ar.' })).message;
  assert.match(vazio, /busca mais concreta/);
  assert.notEqual(vazio, falhou);
});

test('a procura repetida do dia não é um erro', () => {
  const { ok } = runMessage(run({ status: 'success', blocked: 'A procura de hoje já correu.' }));
  assert.equal(ok, true);
});

test('para de pesquisar quando já há mais boas do que cabem no dia', () => {
  assert.equal(enoughToChooseFrom(LIMITS.max - 1), false);
  assert.equal(enoughToChooseFrom(LIMITS.max), true);
  // Nunca pode parar antes do mínimo de um dia: seria poupar cota entregando
  // menos do que o combinado.
  assert.equal(enoughToChooseFrom(LIMITS.min), false, 'parou com o mínimo, e o mínimo não é o alvo');
  assert.ok(LIMITS.min < LIMITS.max, 'o mínimo do dia tem de caber abaixo do tecto');
  // O alvo nunca pode passar o tecto: pedir mais do que se mostra é prometer
  // trabalho que é deitado fora a seguir.
  assert.ok(LIMITS.target <= LIMITS.max, 'o alvo do dia passou o tecto');
  assert.ok(LIMITS.maxDeepResearch >= LIMITS.max, 'não há de onde tirar o tecto do dia');
});

test('as que não chegam ao corte não se perdem: ficam à parte, para ela ver', () => {
  const { ready, below } = partitionDaily([
    cand({ fitScore: 85 }),
    cand({ fitScore: 68 }),
    cand({ fitScore: 40 }),
  ]);
  assert.equal(ready.length, 1);
  assert.equal(below.length, 2, 'uma pesquisa já paga foi deitada fora');
});

test('o corte continua decidindo quem leva email escrito', () => {
  const { ready } = partitionDaily([cand({ fitScore: LIMITS.minFitScore - 1 })]);
  assert.deepEqual(ready, [], 'baixar a régua não era o pedido');
});

test('as de baixo também vêm ordenadas: a melhor das piores aparece primeiro', () => {
  const { below } = partitionDaily([cand({ fitScore: 40 }), cand({ fitScore: 66 }), cand({ fitScore: 55 })]);
  assert.deepEqual(below.map((c) => c.fitScore), [66, 55, 40]);
});

test('um dia sem nenhuma acima do corte ainda tem o que mostrar', () => {
  const { ready, below } = partitionDaily([cand({ fitScore: 60 }), cand({ fitScore: 50 })]);
  assert.equal(ready.length, 0);
  assert.equal(below.length, 2);
});

test('a lista de baixo também tem tecto: não se despeja o funil inteiro', () => {
  const muitas = Array.from({ length: 30 }, () => cand({ fitScore: 50 }));
  assert.equal(partitionDaily(muitas).below.length, LIMITS.max);
});

test('nenhuma acima do corte já não quer dizer nada para ver', () => {
  const { ok, message } = runMessage(run({ discovered: 6, screened: 6, researched: 6, selected: 0, below: 6 }));
  assert.equal(ok, true);
  assert.match(message, /6 marcas para decidir/);
  // A frase antiga dava o assunto por encerrado: «Melhor assim do que encher a
  // lista» é o sistema a decidir por ela sobre trabalho que já foi pago.
  assert.doesNotMatch(message, /Melhor assim/);
});

test('as de baixo também se contam quando houve escolhidas', () => {
  const { message } = runMessage(run({ status: 'success', discovered: 9, selected: 2, below: 3 }));
  assert.match(message, /2 marcas novas/);
  assert.match(message, /3 abaixo do corte/);
});

test('sem nenhuma abaixo do corte, não se promete o que não há', () => {
  const { message } = runMessage(run({ status: 'success', discovered: 9, selected: 2, below: 0 }));
  assert.doesNotMatch(message, /abaixo do corte/);
});

test('um dia inteiro de prospeção cabe no tempo que a rota dá', async () => {
  // A rota dos jobs é morta aos 300s. As chamadas ao modelo são espaçadas para
  // não estourar o limite por minuto do plano grátis, e esse espaçamento é o que
  // manda no relógio: subir o alvo do dia sem contar isto faz a corrida ser
  // morta a meio, todos os dias, sem ninguém entender porquê.
  const { MIN_GAP_MS, PAID_GAP_MS } = await import('@/modules/ai/pace.ts');
  const ROTA_MS = 300_000;

  // A pesquisa de cada marca são duas chamadas: uma à web, pela chave paga, e
  // outra a estruturar o que ela trouxe, pela grátis.
  const naWeb = 1 + LIMITS.maxDeepResearch;
  const noGratis = 1 + LIMITS.maxDeepResearch + LIMITS.max;
  const ms = naWeb * PAID_GAP_MS + noGratis * MIN_GAP_MS;

  assert.ok(
    ms < ROTA_MS,
    `${naWeb} chamadas à web e ${noGratis} ao modelo dão ${Math.round(ms / 1000)}s, e a rota morre aos 300s`,
  );
});

test('a procura só vai a sites onde ela pode escrever em português', () => {
  // Ela não domina inglês o suficiente para abordar marcas estrangeiras. Uma
  // marca alemã ocupa uma vaga do dia e queima a pesquisa que já foi paga.
  const proibidos = /\b(espanha|spain|reino unido|alemanha|germany|frança|itália|estados unidos|eua|usa)\b/i;
  for (let d = 0; d < 40; d++) {
    const dia = new Date(2026, 8, 1 + d);
    for (const pais of strategyFor(dia, []).countries) {
      assert.doesNotMatch(pais, proibidos, `dia ${d}: foi procurar a ${pais}`);
      assert.match(pais, /portugal|brasil|portugu|lusófon/i, `${pais} não garante português`);
    }
  }
});

test('cada estado cai numa seção, e nenhuma marca se perde', () => {
  const estados = ['discovered', 'screened', 'researched', 'ready', 'needs_review',
    'approved', 'edited', 'sent', 'failed'];
  const groups = groupForReview(estados.map((status, i) => ({ status, id: String(i) })));
  assert.equal(groups.reduce((t, g) => t + g.rows.length, 0), estados.length);
});

test('o trabalho vem antes do registro', () => {
  const groups = groupForReview([{ status: 'sent' }, { status: 'ready' }, { status: 'needs_review' }]);
  assert.deepEqual(groups.map((g) => g.section), ['ready', 'review', 'sent']);
});

test('sem marcas numa seção, a seção não aparece vazia', () => {
  const groups = groupForReview([{ status: 'ready' }]);
  assert.equal(groups.length, 1);
});

test('uma marca sem email fica na seção que explica porquê', () => {
  assert.equal(sectionFor('researched'), 'below');
  assert.match(SECTION_HINT.below, /sem email escrito/);
});

test('nenhum título ou dica de seção é um estado cru', () => {
  for (const s of SECTION_ORDER) {
    assert.doesNotMatch(SECTION_TITLE[s], /_|needs|ready|sent/, SECTION_TITLE[s]);
    assert.ok(SECTION_HINT[s].endsWith('.'), `«${SECTION_HINT[s]}» não é uma frase`);
  }
});
