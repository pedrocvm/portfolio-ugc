import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RELEVANCE_GATE,
  familyFor,
  opportunityFor,
  parseManualIntent,
  relevanceFor,
  stem,
} from './intent.ts';

const intent = (q: string, pais = 'Portugal') => parseManualIntent(q, pais);
const cand = (name: string, description: string, category?: string) => ({ name, description, category });

/* ── O defeito que motivou isto ──────────────────────────────────────────── */

test('«hotéis» não devolve apps, por muito que apps encaixem no perfil dela', () => {
  const i = intent('hotéis');
  const app = cand('WonderMoney', 'Aplicação de finanças pessoais e gestão de património.', 'Apps');
  const hotel = cand('Torre de Palma', 'Hotel de vinhos e experiências de luxo no Alentejo.', 'Hotel');

  assert.equal(relevanceFor(app, i).passes, false, 'um app entrou numa busca por hotéis');
  assert.equal(relevanceFor(hotel, i).passes, true);
});

test('cada exemplo que ele deu procura o que foi pedido', () => {
  const casos: [string, string, string][] = [
    ['restaurantes italianos', 'Trattoria do Porto', 'Restaurante italiano com massa fresca.'],
    ['academias', 'CrossFit Braga', 'Ginásio e box de crossfit com aulas diárias.'],
    ['clínicas dentárias', 'Clínica Sorriso', 'Clínica dentária com implantologia.'],
    ['marcas de móveis', 'Casa Nova', 'Marca de mobiliário e decoração para casa.'],
    ['apps de finanças', 'FinHab', 'Aplicativo de finanças pessoais e hábitos.'],
  ];
  for (const [q, nome, desc] of casos) {
    const r = relevanceFor(cand(nome, desc), intent(q));
    assert.equal(r.passes, true, `«${q}» rejeitou ${nome}: ${r.reason}`);
  }
});

test('o contrário também: cada busca rejeita o que não pediu', () => {
  const app = cand('WonderMoney', 'Aplicação de finanças pessoais.', 'Apps');
  for (const q of ['hotéis', 'restaurantes italianos', 'academias', 'clínicas dentárias']) {
    assert.equal(relevanceFor(app, intent(q)).passes, false, `«${q}» aceitou um app`);
  }
});

/* ── Interpretar, não casar palavras ─────────────────────────────────────── */

test('«software para hotéis» é software, não hotelaria', () => {
  const i = intent('software para hotéis');
  const pms = cand('HostBooking', 'Plataforma SaaS de gestão para hotéis e alojamento local.');
  const hotel = cand('Torre de Palma', 'Hotel de luxo no Alentejo com enoturismo.');

  assert.equal(relevanceFor(pms, i).passes, true, 'o software de hotelaria devia entrar');
  // A hotelaria é contexto do pedido, por isso não está nas exclusões — mas o
  // software é que é o alvo, e é ele que pontua mais.
  assert.ok(
    relevanceFor(pms, i).score > relevanceFor(hotel, i).score,
    'um hotel pontuou mais que um software numa busca por software',
  );
});

test('as expansões alargam sem trair o pedido', () => {
  const i = intent('hotéis');
  const juntas = i.expansions.join(' ').toLowerCase();
  assert.match(juntas, /hot[eé]/);
  for (const proibido of ['app', 'saas', 'software', 'home tech', 'pet']) {
    assert.doesNotMatch(juntas, new RegExp(proibido), `expandiu «hotéis» para ${proibido}`);
  }
});

test('uma busca que não cai em família nenhuma funciona à mesma', () => {
  const i = intent('marcas de velas artesanais');
  assert.ok(i.requiredConcepts.length > 0, 'ficou sem nada para exigir');
  assert.equal(relevanceFor(cand('Velas do Porto', 'Velas artesanais de cera de soja.'), i).passes, true);
  assert.equal(relevanceFor(cand('WonderMoney', 'App de finanças.'), i).passes, false);
});

test('plural e singular são a mesma coisa', () => {
  // Português não faz plural de uma maneira só, e cada regra que falta é uma
  // busca que não encontra o que existe.
  for (const [p, s] of [
    ['hotéis', 'hotel'], ['restaurantes', 'restaurante'], ['clínicas', 'clinica'],
    ['academias', 'academia'], ['hospitais', 'hospital'], ['viagens', 'viagem'],
    ['mares', 'mar'], ['luzes', 'luz'], ['pensões', 'pensão'], ['alemães', 'alemão'],
  ]) {
    assert.equal(stem(p), stem(s), `«${p}» e «${s}» ficaram diferentes`);
  }
  assert.equal(relevanceFor(cand('X', 'Hotel de charme'), intent('hotéis')).passes, true);
});

test('a família reconhece-se pelo que a marca faz', () => {
  assert.equal(familyFor('Hotel boutique no Porto')?.id, 'hospitality');
  assert.equal(familyFor('Plataforma SaaS de faturação')?.id, 'software');
  assert.equal(familyFor('Uma coisa qualquer sem categoria'), null);
});

/* ── O portão não se enche com o que sobra ───────────────────────────────── */

test('a razão da rejeição diz-se em português, não em código', () => {
  const r = relevanceFor(cand('WonderMoney', 'App de finanças.'), intent('hotéis'));
  assert.match(r.reason, /hot[eé]is/i);
  assert.doesNotMatch(r.reason, /[{}[\]_]|score|gate|false/);
});

test('o corte é o mesmo para todos e está nomeado', () => {
  const i = intent('hotéis');
  const r = relevanceFor(cand('Torre de Palma', 'Hotel de luxo.'), i);
  assert.equal(r.passes, r.score >= RELEVANCE_GATE);
});

/* ── Oportunidade sem preconceito de nicho ───────────────────────────────── */

const sinais = (o: Partial<Parameters<typeof opportunityFor>[0]> = {}) =>
  opportunityFor({
    paidMedia: 'strong', ugc: 'product_only', demonstrable: 5, creativeGap: 4,
    digitalPresence: 4, reachable: true, sameLanguage: true, ...o,
  });

test('um hotel não é penalizado por não ser SaaS', () => {
  // Foi ela que pediu hotéis. Descontar por não ser tech era o sistema a
  // corrigi-la, que é precisamente o defeito.
  const hotel = sinais();
  assert.ok(hotel.score >= 80, `um hotel forte deu ${hotel.score}`);
  assert.equal(hotel.band, 'Excelente');
});

test('o que baixa a nota é o negócio, não a categoria', () => {
  assert.ok(sinais({ paidMedia: 'none' }).score < sinais({ paidMedia: 'strong' }).score);
  assert.ok(sinais({ reachable: false }).score < sinais({ reachable: true }).score);
  assert.ok(sinais({ demonstrable: 1 }).score < sinais({ demonstrable: 5 }).score);
});

test('desconhecido conta como neutro e fica assinalado', () => {
  const semSaber = sinais({ paidMedia: null, demonstrable: null });
  assert.ok(semSaber.score < sinais().score, 'por saber valeu tanto como confirmado');
  assert.ok(semSaber.score > sinais({ paidMedia: 'none', demonstrable: 0 }).score, 'por saber valeu como zero');
  assert.ok(semSaber.lines.some((l) => l.endsWith(': por saber')), 'nada assinalou o que falta');
});

test('as linhas explicam-se sozinhas, sem jargão', () => {
  for (const l of sinais({ paidMedia: 'none', ugc: 'none', reachable: false }).lines) {
    assert.doesNotMatch(l, /_|score|signal|null|paid_media/i, `«${l}» não se lê`);
  }
});

test('a banda acompanha a nota', () => {
  assert.equal(sinais({ paidMedia: 'none', ugc: 'none', demonstrable: 0, creativeGap: 0, digitalPresence: 0, reachable: false }).band, 'Fraco');
  assert.equal(sinais().band, 'Excelente');
});
