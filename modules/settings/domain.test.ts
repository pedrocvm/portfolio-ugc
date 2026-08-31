import assert from 'node:assert/strict';
import test from 'node:test';
import { blankHealth, summariseHealth, type IntegrationHealth } from './domain.ts';

const box = (over: Partial<IntegrationHealth>): IntegrationHealth => ({
  ...blankHealth('google_gmail'),
  id: crypto.randomUUID(),
  status: 'connected',
  ...over,
});

test('sem caixas, o resumo é «não ligado»', () => {
  assert.equal(summariseHealth([], 'google_gmail').status, 'disconnected');
});

test('uma caixa passa tal e qual, com o nome da conta', () => {
  const r = summariseHealth([box({ account: 'carol@gmail.com' })], 'google_gmail');
  assert.equal(r.status, 'connected');
  assert.equal(r.account, 'carol@gmail.com');
});

test('uma caixa em erro entre duas não pode ler-se como ligada', () => {
  const r = summariseHealth(
    [box({ account: 'a@x.com' }), box({ account: 'b@x.com', status: 'error', lastErrorCode: '42501' })],
    'google_gmail',
  );
  assert.equal(r.status, 'error');
  assert.equal(r.lastErrorCode, '42501');
});

test('revogada pesa mais do que ligada, e menos do que erro', () => {
  const revogada = box({ status: 'revoked' });
  const ligada = box({ status: 'connected' });
  const erro = box({ status: 'error' });
  assert.equal(summariseHealth([ligada, revogada], 'google_gmail').status, 'revoked');
  assert.equal(summariseHealth([revogada, erro], 'google_gmail').status, 'error');
});

test('com várias caixas, conta-se quantas em vez de escolher uma', () => {
  const r = summariseHealth([box({ account: 'a@x.com' }), box({ account: 'b@x.com' })], 'google_gmail');
  assert.equal(r.account, '2 contas');
});

test('a última sincronização é a mais recente de todas, não a da pior', () => {
  const r = summariseHealth(
    [
      box({ account: 'a@x.com', status: 'error', lastSuccessAt: '2026-08-01T10:00:00Z' }),
      box({ account: 'b@x.com', lastSuccessAt: '2026-08-30T10:00:00Z' }),
    ],
    'google_gmail',
  );
  assert.equal(r.status, 'error');
  assert.equal(r.lastSuccessAt, '2026-08-30T10:00:00Z');
});

test('o resumo não carrega o id de nenhuma caixa: não há o que desligar', () => {
  const r = summariseHealth([box({ account: 'a@x.com' }), box({ account: 'b@x.com' })], 'google_gmail');
  assert.equal(r.id, '');
});
