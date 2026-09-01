import assert from 'node:assert/strict';
import test from 'node:test';
import {
  groupByDay,
  statusLabel,
  summarize,
  summarySentence,
  type HistoryRow,
  dayLabel,
  countryLabel,
  dayTotals,
  badgesFor,
  type BadgeInput,
} from './history.ts';

const row = (over: Partial<HistoryRow> = {}): HistoryRow => ({
  id: crypto.randomUUID(),
  name: 'Cecotec',
  domain: 'cecotec.es',
  country: 'ES',
  niche_id: 'home_tech',
  fit_score: 80,
  fit_band: 'A',
  status: 'ready',
  reject_reason: null,
  sent_at: null,
  created_at: '2026-08-31T09:00:00Z',
  red_flags: [],
  quality: { pass: true, score: 90, failures: [] },
  contact_email: 'a@cecotec.es',
  email_confidence: 'high',
  ...over,
});

test('sem histórico, não se inventa um resumo', () => {
  const s = summarize([]);
  assert.equal(s.total, 0);
  assert.equal(s.avgFit, null, 'a média de nada não é zero');
  assert.match(summarySentence(s), /Ainda não há/);
});

test('a média de encaixe ignora quem nunca chegou a ser pesquisada', () => {
  // Uma marca morta na triagem não tem nota. Contá-la como zero fazia a
  // prospecção parecer má por uma razão que não é de qualidade.
  const s = summarize([row({ fit_score: 80 }), row({ fit_score: 90 }), row({ fit_score: null })]);
  assert.equal(s.avgFit, 85);
});

test('cada marca conta uma vez só, na coluna certa', () => {
  const s = summarize([
    row({ status: 'sent' }),
    row({ status: 'ready' }),
    row({ status: 'needs_review' }),
    row({ status: 'rejected' }),
    row({ status: 'skipped' }),
  ]);
  assert.equal(s.total, 5);
  assert.equal(s.sent, 1);
  assert.equal(s.waiting, 2);
  assert.equal(s.discarded, 2);
  assert.equal(s.sent + s.waiting + s.discarded, s.total, 'alguma marca ficou por contar ou contou duas vezes');
});

test('as falhas de qualidade saem por frequência: é o que diz o que corrigir', () => {
  const s = summarize([
    row({ quality: { pass: false, score: 40, failures: ['genérico', 'sem prova'] } }),
    row({ quality: { pass: false, score: 50, failures: ['genérico'] } }),
    row({ quality: { pass: true, score: 90, failures: [] } }),
  ]);
  assert.equal(s.qualityChecked, 3);
  assert.equal(s.qualityPassed, 1);
  assert.deepEqual(s.topFailures[0], { reason: 'genérico', count: 2 });
});

test('a frase conta o que aconteceu sem despejar números soltos', () => {
  const frase = summarySentence(
    summarize([row({ status: 'sent' }), row({ status: 'ready' }), row({ status: 'rejected' })]),
  );
  assert.match(frase, /3 marcas/);
  assert.match(frase, /1 enviada/);
  assert.match(frase, /à espera de você/);
  assert.doesNotMatch(frase, /\bready\b|\brejected\b/, 'um estado cru chegou à frase');
});

test('a frase avisa quando os emails não passam no corte', () => {
  const frase = summarySentence(
    summarize([row({ quality: { pass: false, score: 30, failures: ['genérico'] } })]),
  );
  assert.match(frase, /não passou/);
});

test('o singular e o plural concordam', () => {
  assert.match(summarySentence(summarize([row({ status: 'sent' })])), /1 marca:/);
  assert.doesNotMatch(summarySentence(summarize([row({ status: 'sent' })])), /1 marcas/);
});

test('os dias saem do mais recente para o mais antigo', () => {
  const g = groupByDay([
    row({ created_at: '2026-08-29T10:00:00Z' }),
    row({ created_at: '2026-08-31T10:00:00Z' }),
    row({ created_at: '2026-08-31T18:00:00Z' }),
  ]);
  assert.deepEqual(g.map((d) => d.day), ['2026-08-31', '2026-08-29']);
  assert.equal(g[0].rows.length, 2, 'o mesmo dia partiu-se em dois grupos');
});

test('nenhum estado chega à tela como está na base', () => {
  const crus = ['discovered', 'screened', 'researched', 'ready', 'needs_review',
    'approved', 'edited', 'sent', 'skipped', 'rejected', 'failed'];
  for (const s of crus) {
    const label = statusLabel(s);
    assert.notEqual(label, s, `«${s}» não tem tradução`);
    assert.doesNotMatch(label, /_/, `«${label}» ainda parece um identificador`);
  }
});

test('hoje e ontem dizem-se por extenso, não por data', () => {
  const agora = new Date('2026-08-31T12:00:00Z');
  assert.equal(dayLabel('2026-08-31', agora), 'Hoje');
  assert.equal(dayLabel('2026-08-30', agora), 'Ontem');
  assert.equal(dayLabel('2026-08-22', agora), '22 de agosto');
  // Ano diferente precisa do ano; o mesmo ano não precisa.
  assert.equal(dayLabel('2025-12-04', agora), '4 de dezembro de 2025');
});

test('nenhum cabeçalho de dia sai como data crua', () => {
  const agora = new Date('2026-08-31T12:00:00Z');
  for (const d of ['2026-08-31', '2026-08-30', '2026-08-01', '2024-01-15']) {
    assert.doesNotMatch(dayLabel(d, agora), /\d{4}-\d{2}-\d{2}/);
  }
});

test('o mesmo país escrito de três maneiras vira um só', () => {
  assert.equal(countryLabel('Germany'), 'Alemanha');
  assert.equal(countryLabel('Alemanha'), 'Alemanha');
  assert.equal(countryLabel('DE'), 'Alemanha');
  // Foi o que apareceu na tela: dois países numa string.
  assert.equal(countryLabel('Alemanha / Brasil'), 'Alemanha · Brasil');
  assert.equal(countryLabel('Germany / Brazil'), 'Alemanha · Brasil');
  assert.equal(countryLabel('Alemanha / Germany'), 'Alemanha', 'o mesmo país repetiu-se');
});

test('um país que não conheço passa como veio, não desaparece', () => {
  assert.equal(countryLabel('Estónia'), 'Estónia');
  assert.equal(countryLabel(null), null);
  assert.equal(countryLabel('   '), null);
});

test('um dia com várias corridas soma-as, em vez de escolher uma', () => {
  const t = dayTotals([
    { run_date: '2026-08-31', discovered: 8, researched: 8, selected: 8, status: 'success' },
    { run_date: '2026-08-31', discovered: 6, researched: 6, selected: 0, status: 'empty' },
    { run_date: '2026-08-31', discovered: 0, researched: 0, selected: 0, status: 'error' },
    { run_date: '2026-08-30', discovered: 5, researched: 4, selected: 2, status: 'success' },
  ]).get('2026-08-31')!;
  assert.equal(t.runs, 3);
  assert.equal(t.discovered, 14);
  assert.equal(t.selected, 8);
});

test('sem corridas nesse dia, não se inventa um total', () => {
  assert.equal(dayTotals([]).get('2026-08-31'), undefined);
});

/* ── Etiquetas ───────────────────────────────────────────────────────────── */

const badgeBase: BadgeInput = {
  country: 'Brasil',
  paid_media_signal: 'strong',
  ugc_signal: 'ugc',
  contact_email: 'a@b.pt',
  red_flags: [],
};
const textos = (o: Partial<BadgeInput> = {}) =>
  badgesFor({ ...badgeBase, ...o }).map((b) => b.text);

test('o canal mostrado é o mais útil que existir, e só um', () => {
  // Ela usa WhatsApp; o email é o que o CarolOS envia; o Instagram é o resto.
  assert.ok(textos({ contact: { whatsapp: '+351912345678' } }).includes('WhatsApp'));
  assert.ok(!textos({ contact: { whatsapp: '+351912345678' } }).includes('email'));
  assert.ok(textos({ contact_email: 'a@b.pt' }).includes('email'));
  assert.ok(textos({ contact_email: null, socials: { instagram: '@marca' } }).includes('Instagram'));
});

test('sem contato nenhum, a etiqueta avisa em vez de faltar', () => {
  const b = badgesFor({ ...badgeBase, contact_email: null });
  const canal = b.find((x) => x.text === 'sem contato');
  assert.ok(canal, 'uma marca sem forma de contacto parecia igual às outras');
  assert.equal(canal!.tone, 'warn');
});

test('nenhuma etiqueta é um valor cru da base', () => {
  const crus = /strong|medium|none|creator_program|product_only|ugc_signal|_/;
  for (const sinal of ['strong', 'medium', 'weak', 'none']) {
    for (const ugc of ['creator_program', 'ugc', 'influencers', 'product_only', 'none']) {
      for (const b of badgesFor({ ...badgeBase, paid_media_signal: sinal, ugc_signal: ugc })) {
        assert.doesNotMatch(b.text, crus, `«${b.text}» veio da base sem tradução`);
      }
    }
  }
});

test('as bandeiras contam-se, e o singular concorda', () => {
  assert.ok(textos({ red_flags: ['x'] }).includes('1 bandeira'));
  assert.ok(textos({ red_flags: ['x', 'y'] }).includes('2 bandeiras'));
  assert.ok(!textos({ red_flags: [] }).some((t) => t.includes('bandeira')));
});

test('a linha não fica coberta de etiquetas', () => {
  const cheio = badgesFor({
    country: 'Portugal', paid_media_signal: 'strong', ugc_signal: 'creator_program',
    contact_email: 'a@b.pt', contact: { whatsapp: '+351', instagram: '@x' },
    socials: { instagram: '@x' }, red_flags: ['a', 'b'],
  });
  assert.ok(cheio.length <= 5, `${cheio.length} etiquetas numa linha é uma parede`);
});
