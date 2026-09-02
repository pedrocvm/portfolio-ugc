import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
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

/** As etapas escritas em cada `.from('tabela')…` até à chamada seguinte.
 *
 *  São vários blocos por tabela — a marca procura-se antes de se escrever —
 *  e por isso percorrem-se todos: olhar só para o primeiro dava o `select`. */
function stagesEscritas(tabela: string): string[] {
  const blocos = SEND.split(".from('").slice(1);
  assert.ok(
    blocos.some((b) => b.startsWith(`${tabela}')`)),
    `o envio deixou de escrever em ${tabela}`,
  );
  return blocos
    .filter((b) => b.startsWith(`${tabela}')`))
    .flatMap((b) => [...b.matchAll(/\bstage: '([a-z_]+)'/g)].map((m) => m[1]));
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

/** O `ON CONFLICT` que não existia.
 *
 *  `brand` e `contact` não têm nenhuma chave única que sirva de alvo: em
 *  `brand.normalized_name` o índice existe mas não é único, e o de `contact` é
 *  sobre `lower(email)` — uma expressão, que o Postgres não infere a partir da
 *  coluna. Qualquer `upsert` nestas duas tabelas falha sempre, com «there is no
 *  unique or exclusion constraint matching the ON CONFLICT specification».
 *
 *  Falhava em três sítios e ninguém deu por isso, porque os três ignoravam o
 *  erro: o envio da abordagem, a ingestão do Gmail e a captura. A base
 *  mostra-o — onze contatos, todos do painel antigo, e zero eventos
 *  `contact.discovered`. */
test('ninguém faz upsert em brand nem em contact: não há chave para o conflito', () => {
  const raiz = path.join(import.meta.dirname, '..', '..');
  const ficheiros: string[] = [];
  const andar = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const caminho = path.join(dir, e.name);
      if (e.isDirectory()) andar(caminho);
      else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')) ficheiros.push(caminho);
    }
  };
  for (const area of ['modules', 'app', 'lib']) andar(path.join(raiz, area));

  const culpados: string[] = [];
  for (const f of ficheiros) {
    const texto = readFileSync(f, 'utf8');
    for (const m of texto.matchAll(/\.upsert\(/g)) {
      // A tabela é o `.from('…')` mais próximo antes deste `upsert`.
      const antes = texto.slice(0, m.index);
      const tabela = [...antes.matchAll(/\.from\('([a-z_]+)'\)/g)].pop()?.[1];
      if (tabela === 'brand' || tabela === 'contact') {
        culpados.push(`${path.relative(raiz, f)} → upsert em ${tabela}`);
      }
    }
  }
  assert.deepEqual(culpados, [], culpados.join('; '));
});
