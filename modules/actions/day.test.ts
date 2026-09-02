import assert from 'node:assert/strict';
import test from 'node:test';
import { describeBackground, closingLine, type BackgroundInput } from './day';

const NOW = new Date('2026-09-01T10:00:00Z');
const dia = (n: number) => new Date(NOW.getTime() + n * 86400000).toISOString();

const vazio: BackgroundInput = {
  waiting: [],
  scheduledFollowUps: [],
  snoozed: [],
  runningSearches: 0,
  pendingPayments: [],
  now: NOW,
};

test('sem nada em curso, não inventa linhas', () => {
  assert.deepEqual(describeBackground(vazio), []);
});

/** O ponto da seção inteira: nenhuma destas frases pede nada. Se uma delas
 *  virar imperativo, voltou a ser uma tarefa disfarçada de estado. */
test('nenhuma frase de fundo pede uma ação', () => {
  const itens = describeBackground({
    ...vazio,
    waiting: [{ brandName: 'Cecotec', until: dia(4) }],
    scheduledFollowUps: [{ brandName: 'Vitalis', dueAt: dia(2) }],
    snoozed: [{ brandName: 'PetMaison', title: 'Rever', until: dia(5) }],
    runningSearches: 1,
    pendingPayments: [{ brandName: 'Nuvem', amountCents: 25000, currency: 'EUR', dueAt: dia(10) }],
  });

  assert.equal(itens.length, 5);
  const imperativos = /^(Envi|Respond|Cobr|Reve|Confirm|Clarific|Prepar|Fech|Abr|Veja|Faça)/i;
  for (const i of itens) {
    assert.doesNotMatch(i.label, imperativos, `«${i.label}» está mandando fazer alguma coisa`);
  }
});

test('a espera fala em prazo humano, nunca numa data ISO', () => {
  const [item] = describeBackground({
    ...vazio,
    waiting: [{ brandName: 'Cecotec', until: dia(3) }],
  });
  assert.equal(item.label, 'Nada a fazer com a Cecotec até daqui a 3 dias.');
  assert.doesNotMatch(item.label, /\d{4}-\d{2}-\d{2}/, 'saiu uma data ISO para a tela');
});

test('amanhã diz amanhã, e um dia é dia', () => {
  const [amanha] = describeBackground({
    ...vazio,
    waiting: [{ brandName: 'X', until: dia(1) }],
  });
  assert.match(amanha.label, /até amanhã\.$/);

  const [um] = describeBackground({
    ...vazio,
    scheduledFollowUps: [{ brandName: 'Y', dueAt: dia(1) }],
  });
  assert.match(um.label, /amanhã\.$/);
});

test('o dinheiro sai formatado a partir de cêntimos, sem passar por float', () => {
  const [item] = describeBackground({
    ...vazio,
    pendingPayments: [{ brandName: 'Nuvem', amountCents: 25050, currency: 'EUR', dueAt: dia(3) }],
  });
  assert.match(item.label, /250,50/);
});

test('o que volta a mexer mais cedo aparece primeiro, e a busca sem prazo fica no fim', () => {
  const itens = describeBackground({
    ...vazio,
    scheduledFollowUps: [
      { brandName: 'Tarde', dueAt: dia(9) },
      { brandName: 'Cedo', dueAt: dia(1) },
    ],
    runningSearches: 1,
  });
  assert.deepEqual(
    itens.map((i) => i.brandName),
    ['Cedo', 'Tarde', null],
  );
});

test('o fecho do dia diz o que continua sem ela', () => {
  const linha = closingLine(
    describeBackground({
      ...vazio,
      waiting: [
        { brandName: 'A', until: dia(2) },
        { brandName: 'B', until: dia(6) },
      ],
      runningSearches: 1,
    }),
  );
  assert.match(linha, /a procurar marcas novas/);
  assert.match(linha, /com 2 marcas em espera/);
});

test('sem nada em curso, o fecho não promete trabalho nenhum', () => {
  const linha = closingLine([]);
  assert.match(linha, /Pode fechar/);
  assert.doesNotMatch(linha, /em espera/);
});
