import assert from 'node:assert/strict';
import test from 'node:test';

import { REVISION_CLASSIFICATIONS, REVISION_LABEL } from './domain.ts';

test('toda a classificação de revisão tem nome em português', () => {
  // «Revisão fora do escopo (brief_change)» ficava salva na linha do tempo e
  // ela relê-a meses depois. O código decide se é nova negociação; o nome é
  // que aparece.
  for (const c of REVISION_CLASSIFICATIONS) {
    assert.ok(REVISION_LABEL[c], `«${c}» ia sair em bruto`);
    assert.equal(/_/.test(REVISION_LABEL[c]), false, `o nome de «${c}» ainda parece uma variável`);
  }
});
