import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { STAGES as BRAND_STAGES } from '@/lib/brands';
import { STAGES as OPPORTUNITY_STAGES } from '@/modules/opportunities/domain';

/** O envio da abordagem, lido como texto.
 *
 *  `send.ts` importa o cliente de serviço do Supabase e não carrega neste
 *  runner. O que se verifica aqui é a forma — e é a forma que esteve errada:
 *  a marca e a oportunidade têm vocabulários de etapa diferentes, o envio
 *  escrevia o da oportunidade na marca, a base recusava a escrita, e o email
 *  parava antes de chegar ao Gmail. Sem enviar nada, e sem dizer porquê.
 *
 *  Nenhuma abordagem tinha saído do CarolOS até isto ser corrigido. */

const ROOT = path.join(import.meta.dirname, '..', '..');
const SEND = readFileSync(path.join(ROOT, 'modules/outreach/send.ts'), 'utf8');

/** As etapas escritas dentro de `.from('tabela')…` até à chamada seguinte. */
function stagesEscritas(tabela: string): string[] {
  const inicio = SEND.indexOf(`.from('${tabela}')`);
  assert.ok(inicio > 0, `o envio deixou de escrever em ${tabela}`);
  const fim = SEND.indexOf(".from('", inicio + 10);
  const bloco = SEND.slice(inicio, fim === -1 ? undefined : fim);
  return [...bloco.matchAll(/\bstage: '([a-z_]+)'/g)].map((m) => m[1]);
}

test('a etapa que a marca recebe existe no vocabulário da marca', () => {
  const escritas = stagesEscritas('brand');
  assert.ok(escritas.length > 0, 'o envio deixou de dar uma etapa à marca');
  const validas = BRAND_STAGES.map((s) => s.id) as string[];
  for (const stage of escritas) {
    assert.ok(
      validas.includes(stage),
      `«${stage}» não é etapa de marca: a base recusa a escrita e o envio para antes de sair`,
    );
  }
});

/** Uma marca abordada é um lead no funil dela — não fica fora dele. */
test('a marca entra no funil como abordada', () => {
  assert.deepEqual(stagesEscritas('brand'), ['abordada']);
});

test('a etapa da oportunidade existe no vocabulário da oportunidade', () => {
  const escritas = stagesEscritas('opportunity');
  assert.ok(escritas.length > 0, 'o envio deixou de abrir a oportunidade');
  for (const stage of escritas) {
    assert.ok(
      (OPPORTUNITY_STAGES as readonly string[]).includes(stage),
      `«${stage}» não é etapa de oportunidade`,
    );
  }
});

/** Os dois vocabulários não são o mesmo, e é essa a armadilha: `outreach` é
 *  uma etapa válida — da oportunidade — e escrevê-la na marca passa na revisão
 *  a olho. */
test('os dois vocabulários de etapa não se confundem', () => {
  const marca = BRAND_STAGES.map((s) => s.id) as string[];
  const partilhadas = (OPPORTUNITY_STAGES as readonly string[]).filter((s) => marca.includes(s));
  assert.deepEqual(partilhadas, [], 'passaram a ter etapas em comum: este teste deixa de proteger');
});
