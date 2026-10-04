import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CONTENT_ZONES,
  EMPTY_SCRIPT,
  parseScript,
  scriptLines,
  serializeScript,
  type ScriptDoc,
} from './domain';

/** O roteiro continua numa coluna de texto só.
 *
 *  Quem garante que os campos próprios da tela não comem o que a Carol já
 *  escreveu é este par de funções, e o que este arquivo trava é a ida e a
 *  volta: o que entra pelo parser tem de voltar igual pelo serializador.
 *
 *  O texto abaixo é a forma da peça que está salva, com os blocos encurtados
 *  para caber. É ela que decide quais títulos existem. */
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
  'PROMESSA',
  'Quem nunca viu Carol antes entende de onde a mudança surgiu.',
  '',
  'GANCHO',
  '“Larguei quase 10 anos de carreira em restaurantes.”',
  '',
  'ESTRUTURA',
  'Mudança → dúvida → descoberta → decisão.',
  '',
  'ROTEIRO',
  '[Câmera em você, direto para a lente]',
  '“Larguei quase 10 anos de carreira em restaurantes.”',
  '',
  '[pausa / expressão]',
  '“Sim, eu enlouqueci.”',
  '',
  'EXECUÇÃO',
  'Talking head com B-roll real.',
  '',
  'TEXTO NA TELA',
  'No hook: “10 anos em restaurantes → criação de conteúdo”',
  '',
  'CAPA',
  '“Como eu vim parar criando vídeos para marcas”',
  '',
  'DURAÇÃO ESTIMADA',
  '40–50 segundos.',
  '',
  'GATE FINAL',
  'Z1 autossuficiente; assunto único; sem postura de mentora.',
].join('\n');

test('cada título do roteiro escrito à mão abre num campo próprio', () => {
  const doc = parseScript(ESCRITO_À_MÃO);

  assert.equal(doc.series, 'Transformando UGC em fonte de renda');
  assert.equal(doc.seriesNumber, '01');
  assert.equal(doc.zone, 'z1');
  assert.equal(doc.question, 'Como eu vim parar criando vídeos para marcas?');
  assert.equal(doc.idea, 'Apresentar a pessoa por trás dos vídeos de marcas que já aparecem no perfil.');
  assert.equal(doc.angle, 'Não é uma história de reinvenção depois que tudo deu certo.');
  assert.equal(doc.promise, 'Quem nunca viu Carol antes entende de onde a mudança surgiu.');
  assert.equal(doc.hook, '“Larguei quase 10 anos de carreira em restaurantes.”');
  assert.equal(doc.structure, 'Mudança → dúvida → descoberta → decisão.');
  assert.equal(doc.execution, 'Talking head com B-roll real.');
  assert.equal(doc.screenText, 'No hook: “10 anos em restaurantes → criação de conteúdo”');
  assert.equal(doc.cover, '“Como eu vim parar criando vídeos para marcas”');
  assert.equal(doc.duration, '40–50 segundos.');
  assert.equal(doc.gate, 'Z1 autossuficiente; assunto único; sem postura de mentora.');
});

/** O roteiro fica só com o roteiro: nenhum dos outros títulos sobra lá dentro. */
test('o roteiro não guarda mais os títulos dos outros campos', () => {
  const doc = parseScript(ESCRITO_À_MÃO);

  assert.equal(
    doc.body,
    [
      '[Câmera em você, direto para a lente]',
      '“Larguei quase 10 anos de carreira em restaurantes.”',
      '',
      '[pausa / expressão]',
      '“Sim, eu enlouqueci.”',
    ].join('\n'),
  );

  for (const titulo of ['SÉRIE', 'IDEIA', 'ÂNGULO', 'PROMESSA', 'EXECUÇÃO', 'CAPA', 'GATE FINAL']) {
    assert.ok(!doc.body.includes(titulo), `«${titulo}» ficou dentro do roteiro`);
  }
});

test('o que sai do serializador volta igual pelo parser', () => {
  const doc = parseScript(ESCRITO_À_MÃO);
  assert.deepEqual(parseScript(serializeScript(doc)), doc);
});

test('a ordem dos títulos salvos é a do documento que ela escrevia', () => {
  const saida = serializeScript(parseScript(ESCRITO_À_MÃO));
  const ordem = [
    'SÉRIE:',
    'ZONA:',
    'PERGUNTA DA PEÇA:',
    'IDEIA',
    'ÂNGULO',
    'PROMESSA',
    'GANCHO',
    'ESTRUTURA',
    'ROTEIRO',
    'EXECUÇÃO',
    'TEXTO NA TELA',
    'CAPA',
    'DURAÇÃO ESTIMADA',
    'GATE FINAL',
  ].map((titulo) => saida.indexOf(titulo));

  assert.deepEqual(
    ordem,
    [...ordem].sort((a, b) => a - b),
    'os títulos saíram fora da ordem do documento',
  );
  assert.ok(!ordem.includes(-1), 'algum título não foi escrito de volta');
});

test('as quatro zonas sobrevivem à ida e à volta', () => {
  for (const zona of CONTENT_ZONES) {
    const doc: ScriptDoc = { ...EMPTY_SCRIPT, zone: zona.value, body: 'texto' };
    assert.equal(parseScript(serializeScript(doc)).zone, zona.value);
  }
});

test('texto sem título nenhum é roteiro, não desaparece', () => {
  const doc = parseScript('Só uma nota solta.\nE outra linha.');
  assert.deepEqual(doc, { ...EMPTY_SCRIPT, body: 'Só uma nota solta.\nE outra linha.' });
  assert.equal(serializeScript(doc), 'Só uma nota solta.\nE outra linha.');
});

test('a zona só vira metadado no prefixo usado pela RPC de Referências', () => {
  const body = 'Uma fala da Carol.\nZona Z1\nZona Z8';
  const doc = parseScript(`\nZona Z3\n\n${body}`);
  assert.equal(doc.zone, 'z3');
  assert.equal(doc.body, body);
  assert.deepEqual(parseScript(serializeScript(doc)), doc);
  assert.equal(parseScript('Zona Z8').body, 'Zona Z8');
  assert.equal(parseScript('Zona Z1 aparece nesta frase.').zone, '');
});

test('uma linha perdida antes dos títulos continua no roteiro', () => {
  const doc = parseScript(['Lembrete da Carol.', 'ZONA: Z3 — Conexão', 'ROTEIRO', 'Cena 1.'].join('\n'));
  assert.equal(doc.zone, 'z3');
  assert.equal(doc.body, 'Lembrete da Carol.\nCena 1.');
});

test('o título é reconhecido sem acento e em minúsculas', () => {
  const doc = parseScript(['zona: z2', 'angulo', 'O corte seco.', '', 'duracao estimada', '30s'].join('\n'));
  assert.equal(doc.zone, 'z2');
  assert.equal(doc.angle, 'O corte seco.');
  assert.equal(doc.duration, '30s');
});

test('o número de série sem nome não volta como nome', () => {
  const saida = serializeScript({ ...EMPTY_SCRIPT, seriesNumber: '07', body: 'Cena 1.' });
  assert.equal(parseScript(saida).series, '');
});

test('um campo vazio não escreve título vazio', () => {
  assert.equal(serializeScript(EMPTY_SCRIPT), '');
  assert.deepEqual(parseScript(''), EMPTY_SCRIPT);
});

/** A leitura para gravar. */
test('a direção, a fala e a nota são três coisas diferentes', () => {
  const linhas = scriptLines(parseScript(ESCRITO_À_MÃO).body);

  assert.deepEqual(linhas, [
    { kind: 'direction', text: 'Câmera em você, direto para a lente' },
    { kind: 'speech', text: '“Larguei quase 10 anos de carreira em restaurantes.”' },
    { kind: 'direction', text: 'pausa / expressão' },
    { kind: 'speech', text: '“Sim, eu enlouqueci.”' },
  ]);
});

test('a fala de duas linhas continua uma fala só', () => {
  const linhas = scriptLines('“Mas eu já tava naquela fase de:\n‘tá… e agora?’”');
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].kind, 'speech');
  assert.match(linhas[0].text, /e agora/);
});

test('a direção corta a fala mesmo sem linha em branco', () => {
  const linhas = scriptLines('“Fala um.”\n[gesto do dinheiro]\n“Fala dois.”');
  assert.deepEqual(
    linhas.map((l) => l.kind),
    ['speech', 'direction', 'speech'],
  );
});

test('o que não é direção nem fala é nota, não some', () => {
  const linhas = scriptLines('Mostrar o perfil aqui.');
  assert.deepEqual(linhas, [{ kind: 'note', text: 'Mostrar o perfil aqui.' }]);
});

/** Direção é a linha inteira entre colchetes, não qualquer colchete.
 *
 *  Com a regra frouxa, «Mostrar o perfil [dela] aqui» virava direção e perdia
 *  metade do texto pelo caminho — o parser fica com o que está dentro. */
test('colchete no meio da linha não transforma a linha em direção', () => {
  assert.deepEqual(scriptLines('Mostrar o perfil [dela] aqui.'), [
    { kind: 'note', text: 'Mostrar o perfil [dela] aqui.' },
  ]);

  assert.deepEqual(scriptLines('“Eu pensei [pausa] nisso.”'), [
    { kind: 'speech', text: '“Eu pensei [pausa] nisso.”' },
  ]);
});
