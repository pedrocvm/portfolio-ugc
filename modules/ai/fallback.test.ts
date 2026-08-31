import assert from 'node:assert/strict';
import test from 'node:test';
import { routeSearch, withFallback } from './fallback.ts';

const quota = (extra = '') => new Error(`{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"${extra}}}`);

const keyThat = (behaviour: () => Promise<string>) => ({
  async text() {
    return behaviour();
  },
  async *stream() {
    yield await behaviour();
  },
});

test('quando a primeira chave esgota, a segunda responde', async () => {
  let tries1 = 0;
  const p = withFallback([
    { provider: keyThat(async () => { tries1++; throw quota(); }), label: 'chave 1' },
    { provider: keyThat(async () => 'da segunda'), label: 'chave 2' },
  ]);
  assert.equal(await p.text(), 'da segunda');
  assert.equal(tries1, 1);
});

test('a chave esgotada fica de lado: não se gasta uma chamada por cada pedido', async () => {
  let tries1 = 0;
  const p = withFallback([
    { provider: keyThat(async () => { tries1++; throw quota(); }), label: 'chave 1' },
    { provider: keyThat(async () => 'ok'), label: 'chave 2' },
  ]);
  await p.text();
  await p.text();
  await p.text();
  assert.equal(tries1, 1, 'voltou a bater na chave que já tinha dito que não podia');
});

test('só a cota faz mudar de chave; um erro de código propaga-se', async () => {
  let tries2 = 0;
  const p = withFallback([
    { provider: keyThat(async () => { throw new Error('[400] modelo inválido'); }), label: 'chave 1' },
    { provider: keyThat(async () => { tries2++; return 'ok'; }), label: 'chave 2' },
  ]);
  await assert.rejects(p.text(), /400/);
  assert.equal(tries2, 0, 'gastou a segunda chave num erro que ela ia dar também');
});

test('com todas esgotadas, ainda se tenta a que descansa há mais tempo', async () => {
  let tries = 0;
  const p = withFallback([
    { provider: keyThat(async () => { tries++; throw quota(); }), label: 'chave 1' },
    { provider: keyThat(async () => { tries++; throw quota(); }), label: 'chave 2' },
  ]);
  await assert.rejects(p.text());
  assert.equal(tries, 2, 'não tentou as duas antes de desistir');
  tries = 0;
  await assert.rejects(p.text());
  assert.equal(tries, 1, 'com todas de castigo, devia tentar uma e não todas');
});

test('avisa quando muda de chave, para o registo dizer qual está a servir', async () => {
  const trocas: string[] = [];
  const p = withFallback(
    [
      { provider: keyThat(async () => { throw quota(); }), label: 'chave 1' },
      { provider: keyThat(async () => 'ok'), label: 'chave 2' },
    ],
    (from, to) => trocas.push(`${from}->${to}`),
  );
  await p.text();
  assert.deepEqual(trocas, ['chave 1->chave 2']);
});

test('um stream escolhe a chave antes de começar e não troca a meio', async () => {
  const p = withFallback([
    { provider: keyThat(async () => 'primeira'), label: 'chave 1' },
    { provider: keyThat(async () => 'segunda'), label: 'chave 2' },
  ]);
  const out: unknown[] = [];
  for await (const c of p.stream()) out.push(c);
  assert.deepEqual(out, ['primeira']);
});

/* ── Encaminhar por finalidade ────────────────────────────────────────────── */

const provider = (label: string, fail?: () => never) => ({
  async text() {
    return `text:${label}`;
  },
  async search() {
    if (fail) fail();
    return `search:${label}`;
  },
});

test('a pesquisa vai à chave faturada e o resto fica na grátis', async () => {
  const p = routeSearch(provider('grátis'), provider('faturada'));
  assert.equal(await p.search(), 'search:faturada');
  assert.equal(await p.text(), 'text:grátis', 'uma chamada normal foi parar à chave que paga');
});

test('sem chave de pesquisa, nada muda', async () => {
  const p = routeSearch(provider('grátis'), null);
  assert.equal(await p.search(), 'search:grátis');
  assert.equal(await p.text(), 'text:grátis');
});

test('o 429 na pesquisa diz a verdade, com chave dedicada ou sem ela', async () => {
  const recusa = () => provider('x', () => {
    throw quota();
  });
  // O mesmo erro com as duas configurações: o que falta é a faturação, não a
  // variável de ambiente.
  for (const p of [routeSearch(recusa(), null), routeSearch(provider('grátis'), recusa())]) {
  await assert.rejects(p.search(), (e: Error) => {
    assert.match(e.message, /faturação/);
    assert.doesNotMatch(e.message, /limite de uso/);
    // «Espere um minuto» manda esperar por uma cota que nunca vai chegar.
    assert.doesNotMatch(e.message, /minuto|amanhã|limite de uso/);
    assert.doesNotMatch(e.message, /[{}"]/);
    return true;
  });
  }
});

test('um erro que não é de cota passa como está: não é falta de faturação', async () => {
  const p = routeSearch(
    provider('grátis', () => {
      throw new Error('[400] pedido malformado');
    }),
    null,
  );
  await assert.rejects(p.search(), /400/);
});

test('sem saldo passa à chave seguinte, mas não finge que falta faturação', async () => {
  const semSaldo = new Error('{"error":{"code":429,"message":"Your prepayment credits are depleted."}}');
  const p = withFallback([
    { provider: keyThat(async () => { throw semSaldo; }), label: 'chave 1' },
    { provider: keyThat(async () => 'da segunda'), label: 'chave 2' },
  ]);
  assert.equal(await p.text(), 'da segunda');

  const r = routeSearch(provider('grátis', () => { throw semSaldo; }), null);
  await assert.rejects(r.search(), (e: Error) => {
    assert.doesNotMatch(e.message, /faturação ligada/, 'mandou ligar o que já está ligado');
    return true;
  });
});
