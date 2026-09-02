import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { JOB_PURPOSE, readSchedule } from './domain.ts';

/** O agendador mostra o nome do cron quando não conhece o trabalho, e um
 *  `carolos-outreach` cru numa tabela não diz nada a ninguém. Isto lê a função
 *  que agenda e exige que cada trabalho tenha um nome e um porquê. */

const ROOT = path.join(import.meta.dirname, '..', '..');

function scheduledJobs(): string[] {
  // A última migração a redefinir a função é a que vale — e é preciso ir
  // procurá-la. O nome do arquivo estava escrito à mão aqui, e quando entrou
  // uma migração de horário mais recente este teste continuou a salvar a
  // antiga: passava a verde sobre um agendamento que já não existia.
  const dir = path.join(ROOT, 'supabase', 'migrations');
  const ultima = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .reverse()
    .find((f) => readFileSync(path.join(dir, f), 'utf8').includes('function public.carolos_apply_schedule'));

  assert.ok(ultima, 'nenhuma migração define carolos_apply_schedule');
  const sql = readFileSync(path.join(dir, ultima), 'utf8');
  return [...sql.matchAll(/\['(carolos-[a-z-]+)'/g)].map((m) => m[1]);
}

test('todo o trabalho agendado tem nome e explicação', () => {
  const jobs = scheduledJobs();
  assert.ok(jobs.length >= 8, `só encontrei ${jobs.length} trabalhos na migração`);

  const semNome = jobs.filter((j) => !JOB_PURPOSE[j]);
  assert.deepEqual(semNome, [], `sem entrada em JOB_PURPOSE: ${semNome.join(', ')}`);
});

test('a reconciliação também conta, mesmo não estando na lista principal', () => {
  assert.ok(JOB_PURPOSE['carolos-reconcile'], 'falta o porquê da reconciliação');
});

test('nenhum nome de trabalho é um id cru', () => {
  for (const [id, p] of Object.entries(JOB_PURPOSE)) {
    assert.doesNotMatch(p.label, /carolos-|_/, `«${p.label}» parece um id (${id})`);
    assert.ok(p.why.length > 20, `«${id}» não explica quando nem porquê`);
  }
});

test('nenhum texto do agendador usa o gerúndio europeu', () => {
  for (const p of Object.values(JOB_PURPOSE)) {
    assert.doesNotMatch(`${p.label} ${p.why}`, /\bestá a [a-zà-ú]+r\b/, p.label);
  }
});

test('a expressão de cron lê-se em português', () => {
  const lido = readSchedule('*/15 6-21 * * *');
  assert.doesNotMatch(lido, /\*|\//, `«${lido}» ainda parece cron`);
});
