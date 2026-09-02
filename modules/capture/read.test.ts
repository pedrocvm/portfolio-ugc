import assert from 'node:assert/strict';
import test from 'node:test';
import { readCapture, readFit, tidyUrl, type CaptureFacts } from './read';

/** O cartão mostrava «Não consegui apurar: instagram_handle, contact_name,
 *  contact_email, contact_role, product_name, product_price_cents,
 *  country_code.» — sete nomes de campo em inglês, e nada sobre se aquela
 *  marca lhe servia para alguma coisa. */

const FOCO = ['SaaS e software', 'Apps e produtos digitais', 'Consumer tech e gadgets'];

const factos = (over: Partial<CaptureFacts> = {}): CaptureFacts => ({
  brandName: null,
  website: null,
  instagramHandle: null,
  contactEmail: null,
  contactName: null,
  productName: null,
  nicheId: null,
  summary: '',
  asks: [],
  ...over,
});

/* ── endereços ──────────────────────────────────────────────────────────── */

test('o endereço perde o protocolo, o www e os parâmetros da loja', () => {
  assert.equal(tidyUrl('https://www.systekshop.com/?currency=EUR'), 'systekshop.com');
  assert.equal(tidyUrl('https://loja.pt/produto/x/'), 'loja.pt/produto/x');
  assert.equal(tidyUrl('systekshop.com'), 'systekshop.com');
});

test('um endereço partido não deita nada abaixo', () => {
  assert.doesNotThrow(() => tidyUrl('https://[[['));
  assert.equal(tidyUrl(null), null);
  assert.equal(tidyUrl('  '), null);
});

/* ── o que ela lê ───────────────────────────────────────────────────────── */

/** O ponto de toda a mudança: nada do que sai daqui pode ser um nome de campo. */
test('nenhuma frase traz o nome de um campo do schema', () => {
  const r = readCapture(
    factos({ brandName: 'Systekshop', website: 'https://www.systekshop.com/?currency=EUR' }),
    FOCO,
  );
  const tudo = [r.title, r.what, r.fit.line, r.next, ...r.blocking, ...r.known.map((k) => k.label)].join(' ');
  assert.doesNotMatch(
    tudo,
    /instagram_handle|contact_name|contact_email|contact_role|product_name|product_price_cents|country_code|niche_id|_/,
    tudo,
  );
});

test('sem nome, o endereço serve de título — nunca aparece «null»', () => {
  const r = readCapture(factos({ website: 'https://www.systekshop.com/?currency=EUR' }), FOCO);
  assert.equal(r.title, 'systekshop.com');

  const semNada = readCapture(factos(), FOCO);
  assert.equal(semNada.title, 'Marca por identificar');
  assert.doesNotMatch(JSON.stringify(semNada), /null|undefined/);
});

test('só entra na lista o que existe mesmo', () => {
  const r = readCapture(factos({ brandName: 'X', website: 'https://x.pt', productName: 'Aspirador' }), FOCO);
  assert.deepEqual(
    r.known.map((k) => k.label),
    ['site', 'produto'],
  );
});

test('um resumo que é só o nome outra vez não ocupa linha', () => {
  const r = readCapture(factos({ brandName: 'Systekshop', summary: 'Systekshop' }), FOCO);
  assert.equal(r.what, '');
});

/* ── isto é para mim? ───────────────────────────────────────────────────── */

test('uma marca do foco dela diz que encaixa, e em quê', () => {
  const fit = readFit(factos({ brandName: 'Systekshop', summary: 'loja de gadgets e consumer tech' }), FOCO);
  assert.equal(fit.verdict, 'match');
  assert.match(fit.line, /consumer tech/i);
});

/** O `focusMatch` reclama por família: «loja de gadgets» sai como «SaaS e
 *  software», porque software e gadgets são a mesma família. Chega para
 *  pontuar uma candidata; não chega para escrever uma frase. Sem palavra em
 *  comum, o encaixe diz-se sem nomear o nicho. */
test('sem palavra em comum, encaixa mas não inventa o nicho', () => {
  const fit = readFit(factos({ brandName: 'Systekshop', summary: 'loja de aspiradores' }), FOCO);
  assert.equal(fit.verdict, 'match');
  assert.equal(fit.line, 'Encaixa no que procura.');
  assert.doesNotMatch(fit.line, /saas/i);
});

/** Regra 2 do CarolOS: skincare e haircare estão fora, em código. Dizê-lo aqui
 *  poupa-lhe criar a marca para descobrir depois. */
test('skincare diz que está fora antes de ela criar a marca', () => {
  const fit = readFit(factos({ brandName: 'Creme X', nicheId: 'beauty' }), FOCO);
  assert.equal(fit.verdict, 'excluded');
  assert.match(fit.line, /fora da sua estratégia/i);
});

test('fora do foco não é um não: diz o que é, sem julgar a marca', () => {
  const fit = readFit(factos({ brandName: 'Padaria do Bairro', summary: 'padaria de bairro' }), FOCO);
  assert.equal(fit.verdict, 'unsure');
  assert.doesNotMatch(fit.line, /não presta|má|fraca/i);
});

/* ── o que acontece a seguir ────────────────────────────────────────────── */

/** Substitui a lista de ausências. Ela não precisa saber que campos ficaram
 *  vazios — precisa saber que alguém trata deles. */
test('sem contato, promete procurá-lo em vez de listar o que falta', () => {
  const r = readCapture(factos({ brandName: 'Systekshop' }), FOCO);
  assert.match(r.next, /vou procurar quem contatar/i);
  assert.deepEqual(r.blocking, []);
});

test('com contato, não promete procurar o que já tem', () => {
  const r = readCapture(factos({ brandName: 'X', contactEmail: 'a@b.pt' }), FOCO);
  assert.match(r.next, /já ligado/i);
});

test('uma conversa com um pedido vira oportunidade, e diz isso', () => {
  const r = readCapture(factos({ brandName: 'Cecotec', asks: ['rate_request'] }), FOCO);
  assert.match(r.next, /oportunidade/i);
});

test('uma marca excluída não promete prospeção nenhuma', () => {
  const r = readCapture(factos({ brandName: 'Creme X', nicheId: 'beauty' }), FOCO);
  assert.match(r.next, /registro/i);
  assert.doesNotMatch(r.next, /vou procurar/i);
});

/** A única coisa que a impede mesmo de avançar. Tudo o resto procura-se. */
test('só bloqueia quando nem o nome nem o endereço existem', () => {
  assert.deepEqual(readCapture(factos({ brandName: 'X' }), FOCO).blocking, []);
  assert.deepEqual(readCapture(factos({ website: 'https://x.pt' }), FOCO).blocking, []);
  assert.equal(readCapture(factos(), FOCO).blocking.length, 1);
  assert.match(readCapture(factos(), FOCO).blocking[0], /Escreva o nome/);
});
