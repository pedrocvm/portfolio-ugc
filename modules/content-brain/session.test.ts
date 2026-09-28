import assert from 'node:assert/strict';
import test from 'node:test';

import { loneItems, sessionGroups, type SessionItem } from './session';

const item = (id: string, over: Partial<SessionItem> = {}): SessionItem => ({
  proposalId: id,
  title: `peça ${id}`,
  pillar: 'ugc_income',
  packKind: 'spoken_reel',
  screenRecording: false,
  speech: 'to_camera',
  needsOuting: false,
  assets: [],
  ...over,
});

test('duas peças com o mesmo setup viram uma sessão', () => {
  const g = sessionGroups([item('a'), item('b')]);
  assert.equal(g.length, 1);
  assert.equal(g[0].items.length, 2);
  assert.ok(g[0].shared.includes('em casa'));
  assert.ok(g[0].shared.includes('falando para a câmera'));
});

test('uma peça sozinha não é sessão', () => {
  assert.deepEqual(sessionGroups([item('a')]), []);
  const sozinhas = loneItems([item('a')], []);
  assert.equal(sozinhas.length, 1);
});

test('sair de casa nunca se mistura com ficar em casa', () => {
  const g = sessionGroups([
    item('a', { needsOuting: true, pillar: 'experiences' }),
    item('b', { needsOuting: true, pillar: 'experiences' }),
    item('c'),
    item('d'),
  ]);
  assert.equal(g.length, 2);
  const fora = g.find((x) => x.needsOuting);
  assert.ok(fora);
  assert.equal(fora.items.length, 2);
  assert.match(fora.label, /Sair uma vez/);
});

test('gravação de tela é outro setup e não se mistura', () => {
  const g = sessionGroups([
    item('a', { screenRecording: true }),
    item('b', { screenRecording: true }),
    item('c'),
    item('d'),
  ]);
  assert.equal(g.length, 2);
  assert.ok(g.some((x) => x.shared.includes('gravação de tela')));
});

test('a lista começa pelos assets, que é o que trava a meio', () => {
  const g = sessionGroups([
    item('a', { assets: ['o print do painel'] }),
    item('b', { screenRecording: true, assets: ['o print do painel'] }),
  ]);
  // Setups diferentes: não agrupa. É o comportamento certo.
  assert.equal(g.length, 0);

  const juntas = sessionGroups([
    item('a', { assets: ['o print do painel'] }),
    item('b', { assets: ['o print do painel'] }),
  ]);
  assert.equal(juntas.length, 1);
  assert.match(juntas[0].checklist[0], /^Antes de começar/);
  // O mesmo asset nas duas peças aparece uma vez.
  assert.equal(juntas[0].checklist.filter((c) => c.includes('print do painel')).length, 1);
  assert.ok(juntas[0].checklist.some((c) => c.includes('B-roll partilhado')));
});

test('a sessão não tem datas nem duração: não é agenda de produção', () => {
  const [g] = sessionGroups([item('a'), item('b')]);
  const texto = JSON.stringify(g);
  assert.doesNotMatch(texto, /\b\d{4}-\d{2}-\d{2}\b/);
  assert.doesNotMatch(texto, /minutos|horas|duração/i);
});
