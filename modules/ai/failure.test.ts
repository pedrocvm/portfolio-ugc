import assert from 'node:assert/strict';
import test from 'node:test';
import { aiFailure, failureKind, humanizeErrors } from './failure.ts';

/** O erro exato que apareceu na tela da Carol, colado do relatório. */
const REAL_429 = new Error(
  '{"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. ","status":"RESOURCE_EXHAUSTED","details":[{"@type":"type.googleapis.com/google.rpc.Help","links":[{"description":"Learn more about Gemini API quotas","url":"https://ai.google.dev/gemini-api/docs/rate-limits"}]}]}',
);

test('o 429 real vira uma frase, e nada do JSON sobrevive', () => {
  const out = aiFailure(REAL_429);
  for (const leak of ['{', '}', '"', 'http', '429', 'RESOURCE_EXHAUSTED', 'quota', 'billing']) {
    assert.ok(!out.includes(leak), `«${leak}» chegou à frase: ${out}`);
  }
  assert.match(out, /limite/i);
});

test('nenhuma frase leva pontuação de código ou um link', () => {
  const casos: unknown[] = [
    REAL_429,
    new Error('[401 Unauthorized] API key not valid'),
    new Error('{"error":{"code":503,"status":"UNAVAILABLE"}}'),
    new Error('fetch failed: ENOTFOUND generativelanguage.googleapis.com'),
    new Error('Candidate was blocked due to SAFETY'),
    new Error('qualquer coisa estranha'),
    'uma string solta',
    null,
    undefined,
  ];
  for (const c of casos) {
    const out = aiFailure(c);
    assert.doesNotMatch(out, /[{}"[\]]|https?:|_[A-Z]|[A-Z]{4,}/, `código na frase: ${out}`);
    assert.ok(out.endsWith('.'), `frase sem ponto final: ${out}`);
    assert.ok(out.length > 20, `frase curta demais: ${out}`);
  }
});

test('a cota por minuto e a do dia não dizem a mesma coisa', () => {
  const dia = aiFailure(new Error('429 quota GenerateRequestsPerDayPerProjectPerModel-FreeTier'));
  const minuto = aiFailure(new Error('429 quota GenerateRequestsPerMinutePerProjectPerModel'));
  assert.match(dia, /amanhã/);
  assert.match(minuto, /minuto/);
  assert.notEqual(dia, minuto);
  // Sem saber qual foi, a frase cobre as duas em vez de escolher a errada.
  const vago = aiFailure(REAL_429);
  assert.match(vago, /minuto/);
  assert.match(vago, /amanhã/);
});

test('cada tipo de falha é reconhecido', () => {
  assert.equal(failureKind(new Error('429 RESOURCE_EXHAUSTED')), 'quota');
  assert.equal(failureKind(new Error('API_KEY_INVALID')), 'key');
  assert.equal(failureKind(new Error('503 UNAVAILABLE')), 'overloaded');
  assert.equal(failureKind(new Error('blocked by safety')), 'blocked');
  assert.equal(failureKind(new Error('ENOTFOUND')), 'offline');
  assert.equal(failureKind(new Error('???')), 'unknown');
});

test('o embrulho traduz o que a promessa rejeita', async () => {
  const p = humanizeErrors({
    id: 'gemini',
    async search() {
      throw REAL_429;
    },
  });
  assert.equal(p.id, 'gemini', 'as propriedades que não são função passam intactas');
  await assert.rejects(p.search(), (e: Error) => {
    assert.doesNotMatch(e.message, /[{}"]/);
    assert.equal((e.cause as Error).message, REAL_429.message, 'o erro cru fica no cause, para o log');
    return true;
  });
});

test('o embrulho traduz o que o gerador atira a meio', async () => {
  const p = humanizeErrors({
    async *stream() {
      yield 'primeiro pedaço';
      throw REAL_429;
    },
  });
  const vistos: unknown[] = [];
  await assert.rejects(
    (async () => {
      for await (const chunk of p.stream()) vistos.push(chunk);
    })(),
    (e: Error) => {
      assert.doesNotMatch(e.message, /[{}"]/, `JSON cru no stream: ${e.message}`);
      return true;
    },
  );
  assert.deepEqual(vistos, ['primeiro pedaço'], 'o que já tinha chegado não se perde');
});

/** O erro real da chave com faturação pré-paga e saldo zero. */
const SEM_SALDO = new Error(
  '{"error":{"code":429,"message":"Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing.","status":"RESOURCE_EXHAUSTED"}}',
);

test('saldo esgotado não é cota: uma passa por esperar, a outra não', () => {
  assert.equal(failureKind(SEM_SALDO), 'billing');
  const frase = aiFailure(SEM_SALDO);
  assert.match(frase, /saldo/);
  // Chega como 429 e diz RESOURCE_EXHAUSTED, tal como a cota. Se for lido como
  // cota, a frase manda esperar por algo que só volta quando alguém pagar.
  assert.doesNotMatch(frase, /amanhã|daqui a um minuto/);
  assert.doesNotMatch(frase, /[{}"[\]]|https?:/);
});

test('a causa crua fica no cause: a tradução é para a tela, não para o registo', async () => {
  const cru = new Error('{"error":{"code":400,"message":"Unknown name \\"propertyNames\\""}}');
  const p = humanizeErrors({
    async structured() {
      throw cru;
    },
  });
  await assert.rejects(p.structured(), (e: Error) => {
    assert.doesNotMatch(e.message, /propertyNames/, 'a tela recebeu o erro do fornecedor');
    assert.match((e.cause as Error).message, /propertyNames/, 'o registo perdeu a única pista que havia');
    return true;
  });
});
