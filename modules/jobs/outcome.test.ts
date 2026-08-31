import assert from 'node:assert/strict';
import test from 'node:test';
import { jobOutcome } from './outcome.ts';

test('nunca sai JSON para a tela', () => {
  const casos: [string, unknown][] = [
    ['gmail-sync', { processed: 3, created: 1, duplicates: 2, needsReview: 0, irrelevant: 0 }],
    ['process-pending', { created: 2, duplicate: 1 }],
    ['followups', { markedDue: 2, seeded: 1 }],
    ['rights', { expired: 1 }],
    ['plan', { created: 3, closed: 1, woken: 0 }],
    ['metrics', { requested: 2, skipped: 4 }],
    ['upsell', { found: 1 }],
    ['insights', { created: 8, closed: 2 }],
    ['desconhecido', { seja: 'o que for' }],
  ];
  for (const [job, detail] of casos) {
    const out = jobOutcome(job, detail);
    assert.doesNotMatch(out, /[{}[\]"]/, `${job} devolveu algo com pontuação de JSON: ${out}`);
    assert.ok(out.length > 0 && out.endsWith('.'), `${job} devolveu "${out}"`);
  }
});

test('o Gmail sem nada novo diz isso, e não «0 mensagens»', () => {
  assert.equal(jobOutcome('gmail-sync', { processed: 0, created: 0 }), 'Nada de novo nas caixas.');
});

test('os zeros não entram na frase', () => {
  const out = jobOutcome('gmail-sync', { processed: 5, created: 2, duplicates: 3, needsReview: 0, irrelevant: 0 });
  assert.match(out, /5 mensagens lidas/);
  assert.match(out, /2 conversas novas e 3 já conhecidas/);
  assert.doesNotMatch(out, /0 /);
});

test('uma é singular', () => {
  assert.match(jobOutcome('gmail-sync', { processed: 1, created: 1 }), /1 mensagem lida: 1 conversa nova\./);
  assert.match(jobOutcome('rights', { expired: 1 }), /1 licença expirou\./);
  assert.match(jobOutcome('rights', { expired: 3 }), /3 licenças expiraram\./);
});

test('nada a fazer também é uma resposta, e diz-se', () => {
  assert.match(jobOutcome('followups', { markedDue: 0, seeded: 0 }), /Nenhum follow-up mudou/);
  assert.match(jobOutcome('metrics', { requested: 0 }), /Nenhum trabalho está à espera/);
  assert.match(jobOutcome('insights', {}), /Nada de novo para avisar/);
});

test('detalhe em falta não rebenta nem inventa', () => {
  assert.equal(jobOutcome('gmail-sync', null), 'Nada de novo nas caixas.');
  assert.equal(jobOutcome('gmail-sync', undefined), 'Nada de novo nas caixas.');
});
