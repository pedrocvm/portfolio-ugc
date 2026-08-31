import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BLANK_RIGHTS, RENEWAL_WINDOW_DAYS, computeEnd, exclusivityConflicts, expiryStatus, rightsRisks,
} from './engine.ts';

const scope = (over: Partial<typeof BLANK_RIGHTS> = {}) => ({ ...BLANK_RIGHTS, ...over });

test('uma licença só orgânica e com permissão de portfólio não levanta riscos altos', () => {
  const flags = rightsRisks(scope({ portfolioPermission: true }));
  assert.equal(flags.filter((f) => f.severity === 'high').length, 0);
});

test('uso pago sem duração é risco alto e gera pergunta', () => {
  const flags = rightsRisks(scope({ paidAllowed: true, platforms: ['Meta'], territories: ['PT'] }));
  const flag = flags.find((f) => f.code === 'usage_no_period');
  assert.equal(flag?.severity, 'high');
  assert.match(flag!.question!, /quanto tempo/i);
});

test('uso pago sem canais é risco alto: sem canais, cobre tudo', () => {
  const flags = rightsRisks(scope({ paidAllowed: true, durationDays: 90 }));
  assert.ok(flags.some((f) => f.code === 'usage_no_platforms' && f.severity === 'high'));
});

test('sem território a licença fica implicitamente mundial', () => {
  const flags = rightsRisks(scope({ paidAllowed: true, durationDays: 90, platforms: ['Meta'] }));
  assert.ok(flags.some((f) => f.code === 'usage_no_territory'));
});

test('whitelisting, exclusividade e raw footage são sempre decisão humana', () => {
  const flags = rightsRisks(scope({ whitelisting: true, exclusivity: true, rawFootage: true }));
  for (const code of ['whitelisting', 'exclusivity', 'raw_footage']) {
    assert.equal(flags.find((f) => f.code === code)?.humanOnly, true, code);
  }
});

test('exclusividade sem prazo é assinalada como indefinida', () => {
  const semPrazo = rightsRisks(scope({ exclusivity: true }));
  assert.match(semPrazo.find((f) => f.code === 'exclusivity')!.message, /sem prazo|indefinida/i);

  const comPrazo = rightsRisks(scope({ exclusivity: true, exclusivityEndAt: '2027-01-01' }));
  assert.equal(comPrazo.find((f) => f.code === 'exclusivity')!.question, undefined);
});

test('permissão de portfólio por registar é assinalada', () => {
  assert.ok(rightsRisks(scope()).some((f) => f.code === 'portfolio_unknown'));
  assert.ok(rightsRisks(scope({ portfolioPermission: false })).some((f) => f.code === 'no_portfolio'));
});

test('a data de fim calcula-se do início mais a duração', () => {
  assert.equal(computeEnd('2026-09-01', 30), '2026-10-01');
  assert.equal(computeEnd('2026-09-01', 90), '2026-11-30');
  assert.equal(computeEnd(null, 30), null);
  assert.equal(computeEnd('2026-09-01', null), null);
});

test('uma licença sem fim nunca é tratada como perpétua em silêncio', () => {
  const s = expiryStatus(null);
  assert.equal(s.state, 'no_end');
  assert.match((s as { message: string }).message, /sem data de fim/i);
});

test('a janela de renovação abre a 21 dias', () => {
  const now = new Date('2026-09-01T12:00:00Z');
  const fora = expiryStatus('2026-10-15', now);
  assert.equal(fora.state, 'active');

  const dentro = expiryStatus('2026-09-15', now);
  assert.equal(dentro.state, 'expiring');
  assert.equal(RENEWAL_WINDOW_DAYS, 21);
});

test('uma licença terminada diz há quantos dias', () => {
  const s = expiryStatus('2026-08-20', new Date('2026-09-01T12:00:00Z'));
  assert.equal(s.state, 'expired');
  assert.equal((s as { daysAgo: number }).daysAgo, 12);
});

test('a exclusividade ativa de outra marca é conflito', () => {
  const conflitos = exclusivityConflicts(
    [{ brandName: 'Cecotec', exclusivityScope: 'home tech', exclusivityEndAt: '2027-01-01' }],
    'home tech',
    new Date('2026-09-01'),
  );
  assert.equal(conflitos.length, 1);
  assert.match(conflitos[0], /Cecotec/);
});

test('exclusividade já expirada não conflitua', () => {
  const conflitos = exclusivityConflicts(
    [{ brandName: 'Cecotec', exclusivityScope: 'home tech', exclusivityEndAt: '2026-01-01' }],
    'home tech',
    new Date('2026-09-01'),
  );
  assert.deepEqual(conflitos, []);
});

test('exclusividade de escopo vago avisa na mesma', () => {
  const conflitos = exclusivityConflicts(
    [{ brandName: 'X', exclusivityScope: null, exclusivityEndAt: null }],
    'pet tech',
    new Date('2026-09-01'),
  );
  assert.equal(conflitos.length, 1);
  assert.match(conflitos[0], /sem prazo/);
});
