import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_FOCUS, MAX_NICHES, nicheIdFor, nichesForDay, normalizeFocus,
} from './focus.ts';

test('sem foco salvo, usa-se o tech-first e não o vazio', () => {
  // Uma lista de nichos vazia fazia a busca procurar tudo, que é procurar nada.
  const f = normalizeFocus(null);
  assert.deepEqual(f, DEFAULT_FOCUS);
  assert.deepEqual(normalizeFocus({ niches: [], countries: [] }).niches, DEFAULT_FOCUS.niches);
});

test('ela pode acrescentar nichos que não estão na lista de origem', () => {
  const f = normalizeFocus({ niches: [{ id: '', label: 'Hotéis', favourite: true }] });
  assert.equal(f.niches[0].label, 'Hotéis');
  assert.equal(f.niches[0].id, 'hoteis');
});

test('o mesmo nicho escrito de duas maneiras conta uma vez', () => {
  const f = normalizeFocus({
    niches: [
      { id: '', label: 'Hotéis', favourite: false },
      { id: '', label: 'hoteis', favourite: true },
    ],
  });
  assert.equal(f.niches.length, 1);
});

test('a lista não cresce sem fim', () => {
  const muitos = Array.from({ length: 30 }, (_, i) => ({ id: '', label: `Nicho ${i}`, favourite: false }));
  assert.equal(normalizeFocus({ niches: muitos }).niches.length, MAX_NICHES);
});

test('a quantidade por dia fica dentro do que a corrida aguenta', () => {
  assert.equal(normalizeFocus({ perDay: 0 }).perDay, 1);
  assert.equal(normalizeFocus({ perDay: 500 }).perDay, 40);
  assert.equal(normalizeFocus({ perDay: 20 }).perDay, 20);
});

test('os favoritos aparecem mais, mas os outros não ficam esquecidos', () => {
  const focus = normalizeFocus({
    niches: [
      { id: 'saas', label: 'SaaS', favourite: true },
      { id: 'apps', label: 'Apps', favourite: false },
      { id: 'pet', label: 'Pet', favourite: false },
      { id: 'hoteis', label: 'Hotéis', favourite: false },
    ],
  });
  const vistos = new Set<string>();
  for (let dia = 0; dia < 14; dia++) {
    for (const n of nichesForDay(focus, dia)) vistos.add(n.id);
  }
  assert.equal(vistos.size, 4, `ficaram nichos por procurar: ${[...vistos].join(', ')}`);
});

test('com poucos nichos, procuram-se todos', () => {
  const f = normalizeFocus({ niches: [{ id: 'saas', label: 'SaaS', favourite: true }] });
  assert.equal(nichesForDay(f, 0).length, 1);
});

test('um nicho escrito à mão nunca fica sem id', () => {
  for (const label of ['Hotéis & Resorts', '  Restaurantes  ', 'Ginásios/CrossFit']) {
    assert.ok(nicheIdFor(label).length > 0, `«${label}» ficou sem id`);
    assert.doesNotMatch(nicheIdFor(label), /[^a-z0-9_]/);
  }
});

test('um nicho pode dizer o que procurar lá dentro', () => {
  // «Hotéis» é o rótulo; o que ela quer é mais estreito que isso.
  const f = normalizeFocus({
    niches: [{
      id: '', label: 'Hotéis de luxo', favourite: true,
      note: 'Que façam parcerias em troca de estadia e contratem creators de forma fixa.',
    }],
  });
  assert.match(f.niches[0].note!, /troca de estadia/);
});

test('uma nota vazia não fica ocupando espaço', () => {
  const f = normalizeFocus({ niches: [{ id: '', label: 'Hotéis', favourite: false, note: '   ' }] });
  assert.equal(f.niches[0].note, undefined);
});

test('a nota tem tecto: um ensaio dilui o pedido', () => {
  const f = normalizeFocus({
    niches: [{ id: '', label: 'Hotéis', favourite: false, note: 'x'.repeat(900) }],
  });
  assert.ok(f.niches[0].note!.length <= 400);
});

test('a nota do nicho chega à estratégia da corrida, não fica na tela', () => {
  // Salvar a nota e não a usar era o pior dos casos: parece configurável e
  // não muda nada no que aparece.
  const focus = normalizeFocus({
    niches: [
      { id: '', label: 'Hotéis de luxo', favourite: true, note: 'Que contratem creators de forma fixa.' },
      { id: '', label: 'SaaS', favourite: true },
    ],
  });
  const doDia = nichesForDay(focus, 0, 2);
  const notas = doDia.map((n) => n.note ?? '').filter(Boolean);
  assert.equal(notas.length, 1);
  assert.match(notas[0], /forma fixa/);
});
