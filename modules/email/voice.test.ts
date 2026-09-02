import assert from 'node:assert/strict';
import test from 'node:test';

import { languageOfThread, observeEdit } from './voice';

test('uma marca portuguesa continua a receber português do Brasil', () => {
  // A regra do projeto não abre exceção por domínio. Um `.pt` responde-se em
  // pt-BR na mesma — o que muda com a marca é o tom, nunca a variante.
  assert.equal(
    languageOfThread({
      participants: ['julia@cecotec.pt', 'carolxqueiroz@gmail.com'],
      externalText: 'Olá! Gostaríamos de saber se tem disponibilidade. A nossa equipa acompanha o seu sítio.',
      carolText: '',
    }),
    'pt-BR',
  );
});

test('português é português, venha de onde vier', () => {
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

test('sem sinal nenhum, o padrão é a língua dela', () => {
  assert.equal(
    languageOfThread({ participants: ['x@y.com'], externalText: 'ok', carolText: '' }),
    'pt-BR',
  );
});

/* ── Memória de voz ───────────────────────────────────────────────────────── */

test('as correções de português europeu viram padrão', () => {
  const notas = observeEdit(
    'Olá, Julia. Diga-me se quer ver o portefólio no telemóvel ou prefere o ficheiro por email.',
    'Olá, Julia. Me diga se prefere ver o portfólio no celular ou receber o arquivo por email.',
  );
  assert.ok(notas.some((n) => n.includes('«telemóvel»')));
  assert.ok(notas.some((n) => n.includes('«ficheiro»')));
  assert.ok(notas.some((n) => n.includes('«portefólio»')));
  assert.ok(notas.some((n) => n.includes('«diga-me»')));
});

test('o gerúndio também é uma correção que se aprende', () => {
  const notas = observeEdit('O produto está a caminho e a equipa está a preparar o briefing.', 'O produto está a caminho e a equipe está preparando o briefing.');
  assert.ok(notas.some((n) => n.includes('«equipa»')));
  assert.ok(notas.some((n) => n.includes('está fazendo')));
});

test('uma correção que não aconteceu não vira padrão', () => {
  const notas = observeEdit('Olá, Julia. Me diga como quer avançar.', 'Olá, Julia. Me diga como prefere avançar.');
  assert.deepEqual(
    notas.filter((n) => n.includes('tira «')),
    [],
  );
});

test('encurtar e alongar são padrões diferentes', () => {
  const curta = observeEdit(
    'Uma frase muito comprida com muitas palavras que ela cortou quase toda porque não gosta de mensagens longas nem de rodeios nenhuns.',
    'Obrigada, fico no aguardo.',
  );
  assert.ok(curta.some((n) => n.includes('encurta')));

  const longa = observeEdit(
    'Obrigada.',
    'Obrigada pela confirmação. Aviso assim que o produto chegar e já digo a data prevista de gravação para poderem contar com ela.',
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
