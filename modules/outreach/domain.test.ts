import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dedupe, LIMITS, rankScore, scoreEmail, selectDaily, strategyFor, suppress,
  type Known, type Rankable,
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
    'Olá Camila, vi que a Cecotec lançou o Conga Windroid e que os anúncios mostram o robô a limpar, ' +
    'mas nenhum mostra a parte chata que ele elimina — subir a um escadote para limpar vidros. ' +
    'Sou a Carol, crio conteúdo UGC para marcas de tecnologia doméstica, e gravo em casa com uma ' +
    'rotina real. A ideia seria mostrar o antes e o depois do vidro numa manhã normal, sem estúdio. ' +
    'Deixo aqui exemplos do que costumo fazer. Faz sentido falarmos esta semana?',
  claims: [
    { text: 'lançou o Conga Windroid', sourceId: 'src1' },
    { text: 'anúncios mostram o robô a limpar', sourceId: 'src2' },
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

test('uma afirmação sem fonte reprova o email', () => {
  const r = scoreEmail({
    ...goodEmail,
    claims: [
      { text: 'lançou o Conga Windroid', sourceId: 'src1' },
      { text: 'estão a investir muito em TikTok', sourceId: null },
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

test('um contacto em que não se confia desce', () => {
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
