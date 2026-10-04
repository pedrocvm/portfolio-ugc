import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CONTENT_ZONES,
  EMPTY_SCRIPT,
  parseScript,
  serializeScript,
  type ScriptDoc,
} from './domain';

/** O roteiro continua numa coluna de texto só.
 *
 *  Quem garante que os campos próprios da tela não comem o que a Carol já
 *  escreveu é este par de funções, e o que este arquivo trava é a ida e a
 *  volta: o que entra pelo parser tem de voltar igual pelo serializador. */

const ESCRITO_À_MÃO = [
  'SÉRIE: Transformando UGC em fonte de renda · 01',
  '',
  'ZONA: Z1 — Atração',
  'PERGUNTA DA PEÇA: Como eu vim parar criando vídeos para marcas?',
  '',
  'IDEIA',
  'Apresentar a pessoa por trás dos vídeos de marcas que já aparecem no perfil.',
  '',
  'ÂNGULO',
  'Não é uma história de reinvenção depois que tudo deu certo.',
  '',
  'ROTEIRO',
  'Cena 1: abre em plano fechado.',
  'Cena 2: corta para a cozinha.',
].join('\n');

test('o roteiro escrito à mão abre em campos próprios', () => {
  const doc = parseScript(ESCRITO_À_MÃO);

  assert.equal(doc.series, 'Transformando UGC em fonte de renda');
  assert.equal(doc.seriesNumber, '01');
  assert.equal(doc.zone, 'z1');
  assert.equal(doc.question, 'Como eu vim parar criando vídeos para marcas?');
  assert.equal(doc.idea, 'Apresentar a pessoa por trás dos vídeos de marcas que já aparecem no perfil.');
  assert.equal(doc.angle, 'Não é uma história de reinvenção depois que tudo deu certo.');
  assert.equal(doc.body, 'Cena 1: abre em plano fechado.\nCena 2: corta para a cozinha.');
});

test('o que sai do serializador volta igual pelo parser', () => {
  const doc = parseScript(ESCRITO_À_MÃO);
  assert.deepEqual(parseScript(serializeScript(doc)), doc);
});

test('as quatro zonas sobrevivem à ida e à volta', () => {
  for (const zona of CONTENT_ZONES) {
    const doc: ScriptDoc = { ...EMPTY_SCRIPT, zone: zona.value, body: 'texto' };
    assert.equal(parseScript(serializeScript(doc)).zone, zona.value);
  }
});

test('texto sem cabeçalho nenhum é roteiro, não desaparece', () => {
  const doc = parseScript('Só uma nota solta.\nE outra linha.');
  assert.deepEqual(doc, { ...EMPTY_SCRIPT, body: 'Só uma nota solta.\nE outra linha.' });
  assert.equal(serializeScript(doc), 'Só uma nota solta.\nE outra linha.');
});

test('uma linha perdida antes dos cabeçalhos continua no roteiro', () => {
  const doc = parseScript(['Lembrete da Carol.', 'ZONA: Z3 — Conexão', 'ROTEIRO', 'Cena 1.'].join('\n'));
  assert.equal(doc.zone, 'z3');
  assert.equal(doc.body, 'Lembrete da Carol.\nCena 1.');
});

test('o cabeçalho é reconhecido sem acento e em minúsculas', () => {
  const doc = parseScript(['zona: z2', 'angulo', 'O corte seco.'].join('\n'));
  assert.equal(doc.zone, 'z2');
  assert.equal(doc.angle, 'O corte seco.');
});

test('o roteiro sem nada acima sai sem cabeçalho e com cabeçalho quando há', () => {
  assert.equal(serializeScript({ ...EMPTY_SCRIPT, body: 'Cena 1.' }), 'Cena 1.');
  assert.equal(
    serializeScript({ ...EMPTY_SCRIPT, zone: 'z4', body: 'Cena 1.' }),
    'ZONA: Z4 — Conversão\n\nROTEIRO\nCena 1.',
  );
});

test('o número de série sem nome não volta como nome', () => {
  const saida = serializeScript({ ...EMPTY_SCRIPT, seriesNumber: '07', body: 'Cena 1.' });
  assert.equal(parseScript(saida).series, '');
});

test('um campo vazio não escreve cabeçalho vazio', () => {
  assert.equal(serializeScript(EMPTY_SCRIPT), '');
  assert.deepEqual(parseScript(''), EMPTY_SCRIPT);
});
