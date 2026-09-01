import assert from 'node:assert/strict';
import test from 'node:test';
import { NICHES, nicheLabel, nicheShort } from './niches.ts';


test('nenhum nicho chega à tela como identificador', () => {
  for (const n of NICHES) {
    const label = nicheLabel(n.id);
    assert.ok(label, `${n.id} não tem rótulo`);
    assert.notEqual(label, n.id);
    assert.doesNotMatch(label!, /_/, `«${label}» ainda parece um identificador`);
  }
});

test('um nicho desconhecido não inventa etiqueta', () => {
  assert.equal(nicheLabel('nao_existe'), null);
  assert.equal(nicheLabel(null), null);
  assert.equal(nicheLabel(undefined), null);
});

test('a etiqueta curta cabe num cartão', () => {
  for (const n of NICHES) {
    const curta = nicheShort(n.id)!;
    assert.ok(curta.length <= 22, `«${curta}» é comprida demais para uma etiqueta`);
  }
});
