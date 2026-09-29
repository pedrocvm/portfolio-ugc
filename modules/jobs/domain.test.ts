import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { JOB_PURPOSE, readSchedule } from './domain.ts';

const ROOT = path.join(import.meta.dirname, '..', '..');

function scheduledJobs(): string[] {
  const dir = path.join(ROOT, 'supabase', 'migrations');
  const latest = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .reverse()
    .find((f) => readFileSync(path.join(dir, f), 'utf8').includes('function public.carolos_apply_schedule'));

  assert.ok(latest, 'nenhuma migração define carolos_apply_schedule');
  const sql = readFileSync(path.join(dir, latest), 'utf8');
  return [...sql.matchAll(/\['(carolos-[a-z-]+)'/g)].map((m) => m[1]);
}

test('só agenda trabalhos usados pelo Conteúdo', () => {
  const jobs = scheduledJobs().sort();
  assert.deepEqual(jobs, [
    'carolos-content-audit',
    'carolos-content-community',
    'carolos-content-learning',
    'carolos-content-week',
    'carolos-instagram-sync',
    'carolos-instagram-token',
  ]);
});

test('todo trabalho agendado tem nome e explicação', () => {
  const missing = scheduledJobs().filter((j) => !JOB_PURPOSE[j]);
  assert.deepEqual(missing, []);
  assert.ok(JOB_PURPOSE['carolos-reconcile']);
});

test('nenhum nome de trabalho parece id de máquina', () => {
  for (const [id, p] of Object.entries(JOB_PURPOSE)) {
    assert.doesNotMatch(p.label, /carolos-|_/u, `«${p.label}» parece um id (${id})`);
    assert.ok(p.why.length > 20, `«${id}» não explica quando nem por quê`);
  }
});

test('a expressão de cron vira texto humano', () => {
  const read = readSchedule('*/15 6-21 * * *');
  assert.doesNotMatch(read, /\*|\//, `«${read}» ainda parece cron`);
});
