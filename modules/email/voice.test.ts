import assert from 'node:assert/strict';
import test from 'node:test';

import { languageOfThread, observeEdit } from './voice';

test('um domínio .pt manda escrever português europeu', () => {
  assert.equal(
    languageOfThread({
      participants: ['julia@cecotec.pt', 'carolxqueiroz@gmail.com'],
      externalText: 'Hello, we would like to work with you.',
      carolText: '',
    }),
    'pt-PT',
  );
});

test('português europeu no texto chega, mesmo sem domínio', () => {
  assert.equal(
    languageOfThread({
      participants: ['marketing@marca.com'],
      externalText: 'Olá! Gostaríamos de saber se tem disponibilidade. A nossa equipa acompanha o seu sítio.',
      carolText: '',
    }),
    'pt-PT',
  );
});

test('português do Brasil é reconhecido como outra variante', () => {
  assert.equal(
    languageOfThread({
      participants: ['contato@marca.com.br'],
      externalText: 'Oi! A gente adorou o seu trabalho, você tem interesse?',
      carolText: '',
    }),
    'pt-BR',
  );
});

test('inglês sem acentos é inglês', () => {
  assert.equal(
    languageOfThread({
      participants: ['hello@brand.com'],
      externalText: 'Hi Carol, thanks for reaching out. Could you send us your rates? Looking forward to it.',
      carolText: '',
    }),
    'en',
  );
});

test('sem sinal nenhum, o padrão dela é português europeu', () => {
  // As marcas com que fala são portuguesas. Cair em pt-BR por omissão foi o que
  // pôs «Oi, Julia! Tudo bem?» num email para a Cecotec.
  assert.equal(
    languageOfThread({ participants: ['x@y.com'], externalText: 'ok', carolText: '' }),
    'pt-PT',
  );
});

/* ── Memória de voz ───────────────────────────────────────────────────────── */

test('as correcções de português do Brasil viram padrão', () => {
  const notas = observeEdit(
    'Oi, Julia! Tudo bem? Me conta quais são os próximos passos. Você pode ver no seu celular.',
    'Olá, Julia. Diga-me quais são os próximos passos. Pode ver no telemóvel.',
  );
  assert.ok(notas.some((n) => n.includes('«oi»')));
  assert.ok(notas.some((n) => n.includes('tudo bem?')));
  assert.ok(notas.some((n) => n.includes('me conta')));
  assert.ok(notas.some((n) => n.includes('você')));
  assert.ok(notas.some((n) => n.includes('celular')));
});

test('uma correcção que não aconteceu não vira padrão', () => {
  const notas = observeEdit('Olá, Julia. Diga-me como quer avançar.', 'Olá, Julia. Diga-me como prefere avançar.');
  assert.deepEqual(
    notas.filter((n) => n.includes('tira «')),
    [],
  );
});

test('encurtar e alongar são padrões diferentes', () => {
  const curta = observeEdit(
    'Uma frase muito comprida com muitas palavras que ela cortou quase toda porque não gosta de mensagens longas nem de rodeios nenhuns.',
    'Obrigada, fico à espera.',
  );
  assert.ok(curta.some((n) => n.includes('encurta')));

  const longa = observeEdit(
    'Obrigada.',
    'Obrigada pela confirmação. Aviso assim que o produto chegar e digo já a data prevista de gravação para poderem contar com ela.',
  );
  assert.ok(longa.some((n) => n.includes('alonga')));
});

test('emoji e exclamações contam como estilo', () => {
  assert.ok(observeEdit('Que bom! 😊😊', 'Que bom.').some((n) => n.includes('menos emoji')));
  assert.ok(observeEdit('Combinado!', 'Combinado.').some((n) => n.includes('exclamação')));
  assert.ok(observeEdit('Combinado.', 'Combinado 😊').some((n) => n.includes('acrescenta emoji')));
});

test('um texto igual não produz observações', () => {
  assert.deepEqual(observeEdit('Olá, Julia.', 'Olá, Julia.'), []);
});
