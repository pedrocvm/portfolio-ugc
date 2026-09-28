import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { JOB_PURPOSE, readSchedule } from './domain.ts';

const ROOT = path.join(import.meta.dirname, '..', '..');

function scheduledJobs(): string[] {
  const dir = path.join(ROOT, 'supabase', 'migrations');
  const latest = readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .reverse()
    .find((file) => readFileSync(path.join(dir, file), 'utf8').includes('function public.carolos_apply_schedule'));

  assert.ok(latest, 'nenhuma migração define carolos_apply_schedule');
  const sql = readFileSync(path.join(dir, latest), 'utf8');
  return [...sql.matchAll(/cron\.schedule\('(carolos-[a-z-]+)'/g)].map((match) => match[1]);
}

test('a migração agenda somente a memória do Instagram', () => {
  assert.deepEqual(scheduledJobs().sort(), [
    'carolos-instagram-sync',
    'carolos-instagram-token',
  ]);
});

test('o endpoint manual conhece somente os mesmos dois trabalhos', () => {
  const runner = readFileSync(path.join(ROOT, 'modules', 'jobs', 'runner.ts'), 'utf8');
  const block = runner.slice(runner.indexOf('export const JOBS'), runner.indexOf('] as const', runner.indexOf('export const JOBS')));
  const jobs = [...block.matchAll(/'(instagram-[a-z-]+)'/g)].map((match) => match[1]);
  assert.deepEqual(jobs.sort(), ['instagram-sync', 'instagram-token']);
});

test('todo trabalho agendado tem nome e motivo', () => {
  const missing = scheduledJobs().filter((job) => !JOB_PURPOSE[job]);
  assert.deepEqual(missing, []);
  for (const [id, purpose] of Object.entries(JOB_PURPOSE)) {
    assert.doesNotMatch(purpose.label, /carolos-|_/);
    assert.ok(purpose.why.length > 30, `${id} precisa explicar o motivo`);
  }
});

test('cron vira linguagem humana', () => {
  assert.equal(readSchedule('*/30 * * * *'), 'de 30 em 30 minutos');
  assert.equal(readSchedule('2 6 * * *'), 'uma vez por dia, às 6h02 UTC');
});
